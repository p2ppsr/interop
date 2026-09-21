#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import uiautomator2 as u2


def selector(device, args):
    fields = {
        'text': args.text,
        'description': args.description,
        'resourceId': args.resource_id,
    }
    return device(**{key: value for key, value in fields.items() if value is not None})


parser = argparse.ArgumentParser(description='TPNIL Android UI driver')
parser.add_argument('--serial', required=True)
sub = parser.add_subparsers(dest='command', required=True)
for name in ('click', 'wait', 'set-text'):
    command = sub.add_parser(name)
    group = command.add_mutually_exclusive_group(required=True)
    group.add_argument('--text')
    group.add_argument('--description')
    group.add_argument('--resource-id')
    command.add_argument('--timeout', type=float, default=30.0)
    if name == 'set-text':
        command.add_argument('--value', required=True)
press = sub.add_parser('press')
press.add_argument('--key', required=True)
snapshot = sub.add_parser('snapshot')
snapshot.add_argument('--xml', required=True)
snapshot.add_argument('--png', required=True)

args = parser.parse_args()
device = u2.connect(args.serial)
if args.command in ('click', 'wait', 'set-text'):
    target = selector(device, args)
    if not target.wait(timeout=args.timeout):
        raise SystemExit('selector did not become visible')
    info = target.info
    if args.command == 'click':
        target.click()
    elif args.command == 'set-text':
        target.set_text(args.value)
    print(json.dumps(info, sort_keys=True))
elif args.command == 'press':
    device.press(args.key)
    print(json.dumps({'pressed': args.key}, sort_keys=True))
else:
    Path(args.xml).write_text(device.dump_hierarchy())
    device.screenshot(args.png)
    print(json.dumps({'xml': args.xml, 'png': args.png}, sort_keys=True))
