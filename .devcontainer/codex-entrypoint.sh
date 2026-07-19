#!/usr/bin/env bash
set -euo pipefail

if [[ -f /run/host-ssh/id_ed25519 ]]; then
  install -d -m 700 /root/.ssh
  install -m 600 /run/host-ssh/id_ed25519 /root/.ssh/id_ed25519

  if [[ -f /run/host-ssh/known_hosts ]]; then
    install -m 600 /run/host-ssh/known_hosts /root/.ssh/known_hosts
  fi
fi

exec "$@"
