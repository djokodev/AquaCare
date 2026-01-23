# Database Debug

Query and analyze database state using postgres-mcp.

**Usage:** `/db-debug [description of what to investigate]`

---

## Overview

This command uses the postgres-mcp to run read-only SQL queries against the AquaCare database for debugging purposes.

---

## Common Debug Scenarios

### 1. User Account Issues

```sql
-- Find user by phone
SELECT id, phone_number, first_name, last_name, is_active, date_joined
FROM accounts_user
WHERE phone_number LIKE '%237%';

-- Check user's farm profile
SELECT u.phone_number, f.*
FROM accounts_farmprofile f
JOIN accounts_user u ON f.user_id = u.id
WHERE u.phone_number = '+237612345678';

-- Users registered this month
SELECT COUNT(*), DATE(date_joined) as reg_date
FROM accounts_user
WHERE date_joined >= date_trunc('month', CURRENT_DATE)
GROUP BY DATE(date_joined)
ORDER BY reg_date;
```

### 2. Production Cycle Issues

```sql
-- Active cycles for a user
SELECT id, name, species, status, start_date, initial_count
FROM aquaculture_productioncycle
WHERE user_id = 'uuid-here' AND status = 'active';

-- All cycles with stats
SELECT
    pc.name,
    pc.status,
    pc.start_date,
    pc.initial_count,
    COUNT(cl.id) as log_count,
    SUM(cl.mortality_count) as total_mortality
FROM aquaculture_productioncycle pc
LEFT JOIN aquaculture_cyclelog cl ON cl.cycle_id = pc.id
WHERE pc.user_id = 'uuid-here'
GROUP BY pc.id
ORDER BY pc.start_date DESC;

-- Cycles without any logs (potential issue)
SELECT pc.id, pc.name, pc.start_date
FROM aquaculture_productioncycle pc
LEFT JOIN aquaculture_cyclelog cl ON cl.cycle_id = pc.id
WHERE cl.id IS NULL
AND pc.status = 'active';
```

### 3. Daily Log Issues

```sql
-- Recent logs for a cycle
SELECT id, log_date, mortality_count, feed_kg, client_uuid, synced_at
FROM aquaculture_cyclelog
WHERE cycle_id = 'cycle-uuid-here'
ORDER BY log_date DESC
LIMIT 20;

-- Check for duplicate client_uuid (offline sync issue)
SELECT client_uuid, COUNT(*) as count
FROM aquaculture_cyclelog
WHERE client_uuid IS NOT NULL
GROUP BY client_uuid
HAVING COUNT(*) > 1;

-- Logs created offline but not synced
SELECT id, log_date, created_offline, synced_at, created_at
FROM aquaculture_cyclelog
WHERE created_offline = true AND synced_at IS NULL;

-- Daily log for specific date
SELECT *
FROM aquaculture_cyclelog
WHERE cycle_id = 'cycle-uuid' AND log_date = '2025-01-20';
```

### 4. Commerce / Orders Issues

```sql
-- User's orders
SELECT o.id, o.status, o.total_amount, o.created_at
FROM commerce_order o
WHERE o.user_id = 'user-uuid'
ORDER BY o.created_at DESC;

-- Order with items
SELECT
    o.id as order_id,
    o.status,
    oi.product_id,
    p.name as product_name,
    oi.quantity,
    oi.unit_price
FROM commerce_order o
JOIN commerce_orderitem oi ON oi.order_id = o.id
JOIN commerce_product p ON p.id = oi.product_id
WHERE o.id = 'order-uuid';

-- Products low on stock
SELECT id, name, stock_quantity
FROM commerce_product
WHERE stock_quantity < 10
ORDER BY stock_quantity;
```

### 5. Notifications Issues

```sql
-- Unread notifications for user
SELECT id, title, notification_type, is_read, created_at
FROM notifications_notification
WHERE user_id = 'user-uuid' AND is_read = false
ORDER BY created_at DESC;

-- Notification delivery stats
SELECT
    notification_type,
    COUNT(*) as total,
    SUM(CASE WHEN is_read THEN 1 ELSE 0 END) as read_count
FROM notifications_notification
WHERE created_at >= date_trunc('week', CURRENT_DATE)
GROUP BY notification_type;
```

### 6. Chat / Support Issues

```sql
-- User's conversations
SELECT c.id, c.status, c.created_at,
       COUNT(m.id) as message_count
FROM chat_conversation c
LEFT JOIN chat_message m ON m.conversation_id = c.id
WHERE c.user_id = 'user-uuid'
GROUP BY c.id
ORDER BY c.created_at DESC;

-- Unassigned conversations (support backlog)
SELECT c.id, c.status, c.created_at, u.phone_number
FROM chat_conversation c
JOIN accounts_user u ON c.user_id = u.id
WHERE c.assigned_to_id IS NULL AND c.status = 'open'
ORDER BY c.created_at;
```

### 7. Data Integrity Checks

```sql
-- Orphaned logs (cycle deleted)
SELECT cl.id, cl.cycle_id, cl.log_date
FROM aquaculture_cyclelog cl
LEFT JOIN aquaculture_productioncycle pc ON cl.cycle_id = pc.id
WHERE pc.id IS NULL;

-- Users without farm profile
SELECT u.id, u.phone_number
FROM accounts_user u
LEFT JOIN accounts_farmprofile f ON f.user_id = u.id
WHERE f.id IS NULL AND u.is_active = true;

-- Check UUID format validity
SELECT id, client_uuid
FROM aquaculture_cyclelog
WHERE client_uuid IS NOT NULL
AND client_uuid::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

### 8. Performance Investigation

```sql
-- Large tables row counts
SELECT
    schemaname,
    relname as table_name,
    n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 10;

-- Recent slow operations (check logs created)
SELECT log_date, COUNT(*)
FROM aquaculture_cyclelog
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY log_date
ORDER BY log_date DESC;
```

---

## Query Templates

### Find Record by ID

```sql
SELECT * FROM [table_name] WHERE id = '[uuid]';
```

### Count Records with Condition

```sql
SELECT COUNT(*) FROM [table_name] WHERE [condition];
```

### Join Related Tables

```sql
SELECT t1.*, t2.field
FROM [table1] t1
JOIN [table2] t2 ON t1.foreign_key = t2.id
WHERE [condition];
```

### Check for Duplicates

```sql
SELECT [field], COUNT(*)
FROM [table_name]
GROUP BY [field]
HAVING COUNT(*) > 1;
```

### Date Range Query

```sql
SELECT *
FROM [table_name]
WHERE created_at BETWEEN '[start_date]' AND '[end_date]';
```

---

## Table Reference

| Module | Tables |
|--------|--------|
| accounts | `accounts_user`, `accounts_farmprofile` |
| aquaculture | `aquaculture_productioncycle`, `aquaculture_cyclelog`, `aquaculture_feedingplan`, `aquaculture_sanitarylog`, `aquaculture_nutritionalguide` |
| commerce | `commerce_product`, `commerce_order`, `commerce_orderitem`, `commerce_cart`, `commerce_cartitem` |
| notifications | `notifications_notification` |
| chat | `chat_conversation`, `chat_message` |

---

## Rules

1. **READ-ONLY** - postgres-mcp only allows SELECT queries
2. **No sensitive data exposure** - Don't output passwords or tokens
3. **Use specific queries** - Avoid SELECT * on large tables
4. **Add LIMIT** - Always limit results for large tables
5. **Explain findings** - Interpret results for the user

---

## Output Format

```
DATABASE DEBUG RESULTS
======================

Query: [description of what was checked]

Results:
[Formatted query results]

Analysis:
[Interpretation of what the data shows]

Conclusion:
[What this means for the bug/issue]

Suggested Action:
[Next steps based on findings]
```

---

## References

- Database schema: `backend/apps/*/models.py`
- Django ORM docs for complex queries
