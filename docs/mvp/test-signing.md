# Private-test APK signing

The Android APK workflow signs every test build with one **durable** keystore so
future APKs can update each other in place. The workflow fails loudly when the
secrets are missing; it never generates a throwaway key, because a new key on
every run would make in-place updates impossible.

## Repository secrets

| Secret | Meaning |
| --- | --- |
| `BACK15_KEYSTORE_BASE64` | Base64 of the PKCS12 keystore file |
| `BACK15_KEYSTORE_PASSWORD` | Keystore password |
| `BACK15_KEY_ALIAS` | Key alias (the configured value is `back15-test`) |
| `BACK15_KEY_PASSWORD` | Key password (same value as the keystore password here) |

Secret values are write-only: they can be replaced, never read back. They are
never written to git, artifacts, logs, or this document.

## Creating a replacement key (rotation)

```bash
WORK="$(mktemp -d)"
keytool -genkeypair -v \
  -keystore "$WORK/back15-test.keystore" -storetype PKCS12 \
  -storepass "$(openssl rand -base64 24 | tr -d '\n')" \
  -keypass "$STORE_PASSWORD" -alias back15-test \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Back15 test, OU=Internal, O=Back15, C=US"
base64 -w0 "$WORK/back15-test.keystore" | gh secret set BACK15_KEYSTORE_BASE64 -R egawilldoit/Back15
printf '%s' "$STORE_PASSWORD" | gh secret set BACK15_KEYSTORE_PASSWORD -R egawilldoit/Back15
printf '%s' 'back15-test' | gh secret set BACK15_KEY_ALIAS -R egawilldoit/Back15
printf '%s' "$STORE_PASSWORD" | gh secret set BACK15_KEY_PASSWORD -R egawilldoit/Back15
rm -rf "$WORK"
```

Keep a copy of the keystore somewhere you control if you want to be able to
sign a build without GitHub. Rotating the key **breaks in-place updates** for
APKs signed with the previous key: the next build installs only as a new app
(or after uninstalling the old one), which loses local data.

## What the workflow reports

Each run records, without exposing private material:

- commit SHA
- package id (`com.egawilldoit.back15.test` for the test build)
- signing certificate SHA-256 and SHA-1 fingerprints
- APK file name, size and SHA-256
- artifact name (`back15-test-apk-<commit sha>`)

Two consecutive runs must print the same `signing cert sha256`. If they differ,
the secrets were rotated or replaced.

## Why the test build has its own application id

A phone that already has `com.egawilldoit.back15` signed with a different key
cannot update to an APK signed by this keystore. The test build therefore uses
`com.egawilldoit.back15.test` so it can be installed **alongside** the existing
app without uninstalling it. The existing installation keeps its own data; the
test build starts with an empty journal and cannot read the old app's database.
