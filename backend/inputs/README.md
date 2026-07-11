# Financial Sev-1 Test Logs

Purpose-built synthetic JSONL fixtures for incident triage testing. They contain no real customer, employee, account, card, or transaction data.

| File | Scenario | Expected primary cause |
|---|---|---|
| `payments_db_pool_sev1.jsonl` | Payment API failures after deployment | Database pool reduced from 80 to 20 connections |
| `card_authorization_outage_sev1.jsonl` | Card authorizations time out | External authorization route unavailable |
| `duplicate_transactions_sev1.jsonl` | Duplicate payment attempts | Idempotency store failure during consumer replay |
| `settlement_reconciliation_sev1.jsonl` | Settlement misses regulatory cutoff | Corrupt inbound file and blocked reconciliation batch |

Each line is a JSON event with `timestamp`, `severity`, `service`, `environment`, `region`, `host`, `incident_id`, `event_id`, `trace_id`, `message`, and `fields`.
