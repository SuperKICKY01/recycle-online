-- For scripts/rehearse_migration.py --refuse-sql: on the REHEARSAL SCRATCH only (a superuser
-- connection to scratch_name("recycle_migration_rehearsal")), void one live bill the way the route
-- does, WITH a key -- the row migration 0025's downgrade must refuse to strip.
UPDATE purchase_bills b
   SET voided_at = now(),
       voided_by = (SELECT u.id FROM users u WHERE u.tenant_id = b.tenant_id ORDER BY u.username LIMIT 1),
       void_reason = 'rehearsal: a void made with a key',
       void_idempotency_key = 'rehearsal-key'
 WHERE b.id = (SELECT id FROM purchase_bills WHERE voided_at IS NULL ORDER BY server_received_at LIMIT 1);
