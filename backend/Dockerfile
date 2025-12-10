FROM python:3.12-slim AS builder


LABEL maintainer="Djoko Christian <djoko.dev.pro@gmail.com>"
LABEL description="AquaCare API"
LABEL version="1.0.0"


ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1


RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    libglib2.0-dev \
    libpango1.0-dev \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-dev \
    libffi-dev \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app


COPY requirements/base.txt requirements/production.txt /app/requirements/


RUN pip install --upgrade pip && \
    pip install -r requirements/production.txt


FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=mavecam_api.settings.production

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libjpeg62-turbo \
    netcat-openbsd \
    libglib2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*


RUN groupadd -r aquacare && useradd -r -g aquacare aquacare

WORKDIR /app

RUN mkdir -p /app/media /app/staticfiles /app/logs && \
    chown -R aquacare:aquacare /app


COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin


COPY --chown=aquacare:aquacare . /app/


RUN chmod +x /app/entrypoint.sh


USER aquacare


ENTRYPOINT ["/app/entrypoint.sh"]