# Public site Wi-Fi outage — 2026-09-23

## Status and impact

Connectivity recovered after the operator toggled Wi-Fi off and on. The underlying
cause remains unconfirmed. Prevention measures below are recommendations, not
installed changes.

The host `hymecymeyseh` serves `hymecymeyseh.fun` through Cloudflare Tunnel. Its
Wi-Fi interruption prevented the tunnel from reaching Cloudflare; SSH and
Tailscale connectivity were also affected. The exact public-site outage start
and end were not independently measured.

## Evidence and timeline

All times are September 23, 2026, America/New_York (EDT, UTC−04:00).
Cloudflared's embedded timestamps use UTC, four hours ahead of the journal prefix.

| Local time | Observation |
| --- | --- |
| 08:54:30 | Cloudflared connections were already timing out with `no recent network activity`. This is the earliest failure in the collected window, not necessarily the outage start. |
| 08:55–08:56 | Tailscale also logged connection timeouts. |
| 08:56:26 | Wi-Fi disconnected. `wpa_supplicant` repeatedly reported `Reject scan trigger since one is already pending` and `Failed to initiate AP scan`. |
| 08:56:57 | NetworkManager reported `ssid-not-found`, failed the connection, and removed DHCP leases. Cloudflared subsequently reported `network is unreachable` for both IPv4 and IPv6. |
| 08:57–08:58 | Scan-pending errors continued. |
| 10:51:09–10:51:34 | An explicit connection attempt failed with `ssid-not-found`. |
| 10:54:46–10:54:50 | The operator ran `nmcli radio wifi off`, then `nmcli radio wifi on`. NetworkManager recorded the radio-control requests. |
| 10:55:02 | Wi-Fi activation succeeded and routing was restored. |
| 10:55:09 | Cloudflared registered a connection. |
| 10:55:20–10:55:29 | A separate root `nmcli` activation request interrupted the restored Wi-Fi connection, then reconnected. This matches the tunnel's brief second failure at 10:55:21. |
| 10:55:33 | Cloudflared registered a connection again. |
| 10:59:00 | The remaining three tunnel connections registered successfully. |

Host inspection identified a Broadcom BCM4360 adapter using the `wl` driver on
`wlp3s0`. A kernel journal export for 08:40–09:00 returned `-- No entries --`;
there is no confirmed driver crash in the collected evidence.

## Assessment and limits

The repeated scan-pending errors and recovery after a radio toggle suggest that
the Wi-Fi scanning path became stuck. These observations do not establish whether
the driver, firmware, access point, or another component triggered the problem.
The `ssid-not-found` result alone does not prove the router stopped broadcasting.

There is no evidence in the reviewed logs that public visitors caused the outage.
An attack or traffic overload was not conclusively ruled out: Cloudflare request
analytics, Security Events, application request logs, and historical CPU/memory
metrics were not reviewed. Correlate those sources around 08:45–09:00 EDT if
traffic-related investigation is needed; extend the window if earlier failures
appear.

Both address families failed and QUIC recovered after Wi-Fi returned. Forcing
IPv4 or changing tunnel transport is not supported as a fix by this evidence.
Cloudflared recovered without a service restart.

## Prevention and follow-up

- [ ] Prefer Ethernet for the server. This removes the observed Wi-Fi failure
  path, although router, ISP, power, and application failures remain possible.
- [ ] If Wi-Fi remains necessary, save the connection profile settings below.
- [ ] Implement and test a systemd recovery watchdog with diagnostic logging,
  consecutive-failure thresholds, and a cooldown.
- [ ] Configure external monitoring of the public URL, with recovery notifications.
- [ ] Investigate driver/firmware updates against the installed Ubuntu/kernel
  versions if this recurs; no specific update has been validated as a fix.

### Wi-Fi profile settings

At inspection, `MyOptimum 8ed9f9` had autoconnect enabled, autoconnect retries `-1`
(default), and power saving `default`. The following proposed command enables
unlimited autoconnect retries and explicitly disables Wi-Fi power saving:

```bash
sudo nmcli connection modify "MyOptimum 8ed9f9" \
  connection.autoconnect yes \
  connection.autoconnect-retries 0 \
  802-11-wireless.powersave 2
```

The saved settings apply on the next activation. Do not force a reconnect during
an active remote session just to apply them. Disabling power saving is a mitigation
to evaluate, not a proven fix; unlimited retries cannot necessarily clear a stuck
scan. Verify the saved values with:

```bash
nmcli -g connection.autoconnect,connection.autoconnect-retries,802-11-wireless.powersave \
  connection show "MyOptimum 8ed9f9"
```

To restore the values observed during this investigation:

```bash
sudo nmcli connection modify "MyOptimum 8ed9f9" \
  connection.autoconnect yes \
  connection.autoconnect-retries -1 \
  802-11-wireless.powersave 0
```

See the [NetworkManager settings reference](https://www.networkmanager.dev/docs/api/latest/nm-settings-nmcli.html)
for retry and power-saving semantics.

### Recovery watchdog requirements (not implemented)

Check local Wi-Fi association, addressing, and route state over several checks.
Do not reset Wi-Fi solely because a public URL, DNS lookup, or Internet ping fails:
an application, upstream, or remote-service outage should not disrupt a healthy
local connection. Capture logs before recovery, serialize recovery attempts, cap
their frequency, and respect intentionally disabled Wi-Fi. Allow NetworkManager
time to autoconnect after a radio toggle; do not issue a redundant activation once
the connection is healthy.

A watchdog should be tested for normal connectivity, sustained local Wi-Fi
failure, upstream-only failure, intentional radio disablement, and recovery
cooldown behavior. It must survive loss of the SSH session. Document its system
service privileges separately from the application's user services before rollout.

### Manual recovery and evidence collection

A radio toggle disconnects Wi-Fi SSH sessions. Use a local console or independent
management connection so both commands can be completed:

```bash
sudo nmcli radio wifi off
sudo nmcli radio wifi on
```

Wait for automatic reconnection before issuing any additional connect command.
Check NetworkManager and tunnel logs to verify recovery.

To share evidence with the development account without pasting terminal output,
export a bounded journal window into a readable file. For this incident:

```bash
sudo journalctl --since "2026-09-23 08:40:00" \
  --until "2026-09-23 09:00:00" --no-pager > /tmp/network-logs.txt
chmod 644 /tmp/network-logs.txt
```

Adjust the time window for future incidents. This file is readable by local users;
review it for sensitive content before sharing. Keep raw logs and credentials out
of the repository. The investigation used `/tmp/network-logs.txt` and
`/tmp/wifi-kernel.txt`; temporary files are not durable incident archives.

Related: [September 21 unexpected restarts](2026-09-21-unexpected-restarts.md).
That incident remains separate; the available evidence does not link the two.
