#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# SCRIPT RESTORE POSTGRESQL - AquaCare
# ════════════════════════════════════════════════════════════════════════════
#
# USAGE :
#   ./restore.sh [backup_file.sql.gz]
#   ./restore.sh                        # Restaure dernier backup
#
# DESCRIPTION :
#   - Restaure une base PostgreSQL depuis un fichier backup
#   - Arrête l'API pendant la restauration
#   - Redémarre l'API après restauration
#
# ⚠️ ATTENTION : Cette opération ÉCRASE les données actuelles !
#
# ════════════════════════════════════════════════════════════════════════════

set -e

# Charger variables d'environnement
if [ -f "/root/aquacare/.env" ]; then
  export $(cat /root/aquacare/.env | grep -v '^#' | xargs)
fi

# Configuration
BACKUP_DIR="/root/aquacare/backups"
CONTAINER_NAME="aquacare_postgresDB_prod"

# Déterminer quel backup restaurer
if [ -z "$1" ]; then
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | head -n1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "❌ No backup files found in $BACKUP_DIR"
    exit 1
  fi
  echo "ℹ️  No backup specified, using latest: $BACKUP_FILE"
else
  BACKUP_FILE="$1"
  if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
  fi
fi

echo "════════════════════════════════════════"
echo "🔄 Restore PostgreSQL"
echo "════════════════════════════════════════"
echo "📁 Backup file: $BACKUP_FILE"
echo ""

# Confirmation utilisateur
read -p "⚠️  This will OVERWRITE current database. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Restore cancelled"
  exit 0
fi

# Arrêter l'API (pour éviter écritures pendant restore)
echo "🛑 Stopping API container..."
cd /root/aquacare
docker-compose -f docker-compose.prod.yml stop api

# Décompresser si nécessaire
TEMP_SQL="/tmp/restore_temp.sql"
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "🗜️  Decompressing backup..."
  gunzip -c "$BACKUP_FILE" > "$TEMP_SQL"
else
  cp "$BACKUP_FILE" "$TEMP_SQL"
fi

# Restaurer la base
echo "📥 Restoring database..."
docker exec -i $CONTAINER_NAME psql \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  < "$TEMP_SQL"

# Nettoyer fichier temporaire
rm -f "$TEMP_SQL"

# Redémarrer l'API
echo "🚀 Restarting API container..."
docker-compose -f docker-compose.prod.yml up -d api

# Attendre que l'API soit prête
echo "⏳ Waiting for API to be ready..."
sleep 10

# Health check
if curl -f http://localhost/api/health/ > /dev/null 2>&1; then
  echo "✅ API is healthy"
else
  echo "⚠️  API health check failed, check logs"
fi

echo ""
echo "════════════════════════════════════════"
echo "✅ Restore completed successfully"
echo "════════════════════════════════════════"
