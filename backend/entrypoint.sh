#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
while ! nc -z $POSTGRES_HOST $POSTGRES_PORT; do
  sleep 0.5
done
echo "✅ PostgreSQL is ready!"

echo "Running database migrations..."
python manage.py migrate --noinput

echo "📦 Collecting static files..."
python manage.py collectstatic --noinput --clear

# Charger les données nutritionnelles (création via ORM, pas de JSON requis)
echo "📚 Loading nutritional guides..."
python manage.py load_nutritional_data || echo "⚠️  Nutritional data already loaded or error occurred"

# Charger les produits MAVECAM (27 produits : 18 Aller Aqua + 9 DIBAQ)
echo "🛒 Loading MAVECAM product catalog..."
python manage.py load_products || echo "⚠️  Product catalog already loaded or error occurred"

echo "=========================="
echo "AquaCare API it's Ready"
echo "=========================="

exec "$@"
