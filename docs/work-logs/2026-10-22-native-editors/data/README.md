# Chart retirement (2026-10-22, operator: 图表文件删除)

- `chart-artifact-roots-before.json` / `chart-platform-assets-before.json`: rows before the change (62 live chart artifacts: 45 platform public, 17 operator-owned; 63 chart material-shelf rows: 62 approved, 1 template).
- `chart-favorites-before.json`: favorites on those artifacts (none).
- `chart-retire.sql`: applied 2026-10-22 via `supabase-sql oceanleo -f` — `typed_artifact_retire` per artifact (writes `artifact.retire` audit events), shelf rows set to `rejected`.
- `chart-restore.sql`: exact reversal (not applied).
Result after apply: 0 live chart artifacts (87 total, all retired), 63 shelf rows `rejected`.
