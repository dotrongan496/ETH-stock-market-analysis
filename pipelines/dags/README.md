# pipelines/dags

Airflow DAGs. Mỗi task phải idempotent: ghi theo partition ngày và upsert theo khóa `(symbol, trade_date)`.

