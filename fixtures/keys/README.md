# Public Android laboratory signing fixture

`android-lab-fixture.p12` signs APKs derived from publisher AAB artifacts when an
Android emulator requires an installable universal APK. It is a public test key,
not a secret and not a publisher identity.

- Alias: `tpnil-lab-fixture`
- Store and key password: `tpnil-fixture`
- PKCS#12 SHA-256: `a40e716aee3db6468b482f00fd531fa33a61dafb47d213056b07da67c34d4884`
- Certificate SHA-256: `8f9b2aea7155ee143e2d3f4e56e379c21d16b86005c625a011cde9c188333d45`
- Subject: `CN=TPNIL Public Laboratory Fixture, OU=ITCVE-1, O=Peer-to-peer Privacy Systems Research LLC, L=Medford, ST=Oregon, C=US`

An APK bearing this certificate is a laboratory deployment derivative. Its
compiled payload can remain byte-derived from a publisher AAB, but its APK
signature does not establish publisher signing or store delivery. Reports bind
both the original AAB digest and the derived APK digest and state this distinction.
