#!/bin/sh
set -eu

# The application process runs as the unprivileged `venera` user. This
# entrypoint only prepares the mounted data/config directories when the
# container starts as root, then drops privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}" "${CONFIG_DIR:-/config}"
  chown -R venera:venera "${DATA_DIR:-/data}" "${CONFIG_DIR:-/config}" 2>/dev/null || true
  exec gosu venera "$@"
fi

exec "$@"
