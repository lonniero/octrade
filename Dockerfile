# ── Octadre Web Dockerfile ──────────────────────────────────
# Static MIDI sequencer app — served with nginx

FROM nginx:alpine

# Copy the static files to nginx's serve directory
COPY public /usr/share/nginx/html

# Custom nginx config for SPA-friendly routing
RUN echo 'server { \
    listen 3002; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
