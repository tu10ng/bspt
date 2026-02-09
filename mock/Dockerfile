FROM python:3.11-slim

WORKDIR /app

COPY vrp_mock/ ./vrp_mock/
COPY responses/ ./responses/

EXPOSE 23

CMD ["python", "-m", "vrp_mock.server"]
