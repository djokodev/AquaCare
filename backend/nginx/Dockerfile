FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN mkdir -p /app/staticfiles /app/media

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
