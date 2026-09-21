# Unexpected server restarts — 2026-09-21

## Status

Open. The server restarted unexpectedly; the cause is not established.

## Observations

- The host is an Apple MacBookPro11,1 running Ubuntu as the MediaSpace server. Its battery is missing, so it depends on continuous AC power.
- The previous boot's journal continued to roughly 11,979 seconds (3 hours 20 minutes) of uptime, then ended after routine `sysstat-collect` activity. The excerpt contained no orderly shutdown or reboot request.
- The previous boot's kernel warnings occurred near startup. They included a warning while the proprietary Broadcom `wl` Wi-Fi module loaded. No kernel warning near the end of that boot was present in the supplied warning-level log.
- `/sys/fs/pstore` was empty after the restart; no persistent kernel crash report was available.
- During the next boot, the system clock initially read July 27, 2026. Chrony stepped it forward by 4,837,163.844671 seconds to September 21, 2026. Later `chronyc tracking` showed normal synchronization with a sub-millisecond offset.
- The server time zone was UTC. On September 21, 20:39 UTC corresponded to 16:39 EDT. The time zone was changed to `America/New_York` and `timedatectl` confirmed the correct local time.

## Working hypotheses

A brief AC interruption, loose power connection, or failing power adapter is plausible because the battery is missing and the journal stopped abruptly. A hardware or kernel fault remains possible. The available logs do not identify the cause. The Broadcom startup warning and clock reset are observations, not proven causes of the restart.

## Follow-up

- [ ] Check the adapter, connector, outlet, and any power strip; try a known-good adapter or UPS if available.
- [ ] If another restart occurs, record the wall time and the time shown immediately after boot, before Chrony corrects it.
- [ ] After any recurrence, collect `sudo journalctl -b -1 -n 200 --no-pager -o short-monotonic`, `sudo journalctl -b -1 -k -p warning..emerg --no-pager -o short-monotonic`, and `sudo ls -la /sys/fs/pstore`.
- [ ] Determine why the clock starts with an old date after a restart. Check firmware/RTC behavior and whether power loss correlates with the restart.
- [ ] Reassess the Broadcom `wl` warning if later logs show Wi-Fi or kernel instability near a restart.

## Future incident entries

For each restart, add the observed local time and time zone, boot ID, previous boot uptime, whether AC power was interrupted, whether the system clock jumped, final journal entries, kernel warnings, pstore contents, and any changes made since the previous incident.
