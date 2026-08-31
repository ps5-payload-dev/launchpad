# launchpad
This is a webapp that launches ELF payloads on jailbroken PS5s. It runs in the
console's browser and deploys payloads via [elfldr][elfldr]. A companion payload
(launchpad-install.elf) adds a launcher to the home screen.

## Building
Assuming you have the [ps5-payload-sdk][sdk-ps5] installed on a POSIX machine,
the installer can be compiled using the following two commands:
```console
john@localhost:launchpad$ export PS5_PAYLOAD_SDK=/opt/ps5-payload-sdk
john@localhost:launchpad$ make
```

## Adding Payloads
Payloads are listed in docs/payloads.json. The display name, description,
source code and args fields are maintained by hand, while releases and
contributors are generated from the GitHub API:
```console
john@localhost:launchpad$ python3 scripts/update-payloads.py
```
A Github workflow runs this script daily, so a new release of a listed payload
shows up on its own.

## Reporting Bugs
If you encounter problems with launchpad, please [file a github issue][issues].
If you plan on sending pull requests which affect more than a few lines of code,
please file an issue before you start to work on you changes. This will allow us
to discuss the solution properly before you commit time and effort.

## License
launchpad is licensed under the GPLv3+.

[sdk-ps5]: https://github.com/ps5-payload-dev/sdk
[elfldr]: https://github.com/ps5-payload-dev/elfldr
[issues]: https://github.com/ps5-payload-dev/launchpad/issues/new
