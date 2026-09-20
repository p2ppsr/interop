#!/usr/bin/env python3
"""Safely extract a canonical TPNIL web-root archive and print its inventory."""

import hashlib
import json
import os
import pathlib
import sys
import tarfile


def fail(message: str) -> None:
    raise SystemExit(f"TPNIL EXTRACT ERROR: {message}")


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: extract-webroot.py <archive.tgz> <empty-destination>")
    archive = pathlib.Path(sys.argv[1]).resolve(strict=True)
    destination = pathlib.Path(sys.argv[2]).resolve(strict=True)
    if any(destination.iterdir()):
        fail("destination must be empty")

    members: list[tarfile.TarInfo]
    with tarfile.open(archive, mode="r:gz") as bundle:
        members = bundle.getmembers()
        names: set[str] = set()
        for member in members:
            path = pathlib.PurePosixPath(member.name)
            if (
                not member.isfile()
                or path.is_absolute()
                or not path.parts
                or any(part in ("", ".", "..") for part in path.parts)
                or member.name in names
            ):
                fail(f"unsafe or unsupported archive member: {member.name}")
            names.add(member.name)
            target = (destination / pathlib.Path(*path.parts)).resolve()
            if destination not in target.parents:
                fail(f"archive member escapes destination: {member.name}")

        for member in members:
            target = destination / pathlib.Path(*pathlib.PurePosixPath(member.name).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            source = bundle.extractfile(member)
            if source is None:
                fail(f"archive member has no data: {member.name}")
            with source, target.open("xb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
            os.chmod(target, 0o644)

    inventory = []
    for file in sorted(destination.rglob("*")):
        if not file.is_file() or file.is_symlink():
            continue
        data = file.read_bytes()
        inventory.append(
            {
                "path": file.relative_to(destination).as_posix(),
                "sha256": hashlib.sha256(data).hexdigest(),
                "size": len(data),
            }
        )
    print(json.dumps({"files": inventory}, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
