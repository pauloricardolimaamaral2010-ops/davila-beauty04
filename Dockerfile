FROM python:3.13-slim

WORKDIR /app

# Dependências
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Código + dados estáticos
COPY . .

EXPOSE 5000

# Health check — usado pelos nossos monitoramentos
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://localhost:5000/healthz', timeout=5).status == 200 else 1)"

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "app:app"]
