#!/usr/bin/env python3
"""Check required Android APK assets and native libraries; this is not runtime proof."""

import argparse
import sys
import zipfile
from pathlib import Path


REQUIRED_LIBRARIES = {
    "libreactnative.so",
    "libhermesvm.so",
    "librnskia.so",
    "libreanimated.so",
    "libworklets.so",
}


def verify_apk(apk_path: Path) -> list[str]:
    errors = []
    try:
        with zipfile.ZipFile(apk_path) as apk:
            entries = {info.filename: info for info in apk.infolist()}
            bundle = entries.get("assets/index.android.bundle")
            if bundle is None or bundle.file_size == 0:
                errors.append("missing or empty assets/index.android.bundle")

            abi_libraries: dict[str, set[str]] = {}
            for info in apk.infolist():
                parts = info.filename.split("/")
                if len(parts) == 3 and parts[0] == "lib" and parts[2].endswith(".so"):
                    if info.file_size:
                        abi_libraries.setdefault(parts[1], set()).add(parts[2])

            if not abi_libraries:
                errors.append("no native ABI libraries found under lib/<abi>/")
            for abi, libraries in sorted(abi_libraries.items()):
                missing = sorted(REQUIRED_LIBRARIES - libraries)
                if missing:
                    errors.append(f"{abi} is missing: {', '.join(missing)}")
    except (OSError, zipfile.BadZipFile) as exc:
        errors.append(f"cannot read APK {apk_path}: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check APK bundle and native library assets (not runtime proof)."
    )
    parser.add_argument("apk", type=Path, help="path to the APK to inspect")
    args = parser.parse_args()

    errors = verify_apk(args.apk)
    if errors:
        print(f"APK asset check failed: {args.apk}", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"APK asset check passed: {args.apk}")
    print("This check does not prove the app launches or runs correctly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
