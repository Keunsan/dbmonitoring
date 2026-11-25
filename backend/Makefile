.PHONY: install run lint test

install:
	pip install -r requirements.txt

run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port $${APP_PORT:-8000}

lint:
	ruff check app src
	mypy app src --ignore-missing-imports

test:
	pytest -q