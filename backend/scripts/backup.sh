#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# SCRIPT BACKUP POSTGRESQL
# ════════════════════════════════════════════════════════════════════════════
#
# USAGE :
#   ./backup.sh
#
# DESCRIPTION :
#   - Crée un dump de la base PostgreSQL de production
#   - Stocke dans /root/aquacare/backups/
#   - Garde les 7 derniers backups (supprime les plus anciens)
#
# ════════════════════════════════════════════════════════════════════════════

set -e

# Charger variables d'environnement
if [ -f "/root/aquacare/.env" ]; then
  export $(cat /root/aquacare/.env | grep -v '^#' | xargs)
fi

# Configuration
BACKUP_DIR="/root/aquacare/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"
CONTAINER_NAME="aquacare_postgresDB_prod"

# Créer dossier backups si inexistant
mkdir -p "$BACKUP_DIR"

echo "════════════════════════════════════════"
echo "📦 Backup PostgreSQL"
echo "════════════════════════════════════════"

# Vérifier que le container existe
if ! docker ps -q -f name=$CONTAINER_NAME > /dev/null 2>&1; then
  echo "❌ Container $CONTAINER_NAME not found or not running"
  exit 1
fi

# Créer le backup
echo "🔄 Creating database dump..."
docker exec $CONTAINER_NAME pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner \
  --no-acl \
  > "$BACKUP_FILE"

# Compresser le backup
echo "Compressing backup..."
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

# Taille du backup
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Nettoyer les anciens backups (garder 7 derniers)
echo "Cleaning old backups (keeping last 7)..."
ls -t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

# Afficher liste des backups
echo ""
echo "Available backups:"
ls -lh "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo "════════════════════════════════════════"
echo "✅ Backup completed successfully"
echo "════════════════════════════════════════"
