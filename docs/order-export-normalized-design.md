# Order Export Normalized Design

This document has been consolidated into the portfolio-oriented design document below:

- [Order Normalization Pipeline](order-normalization-pipeline.md)

The current design is:

1. Store each mall response as raw JSON in `hub_job_result`.
2. Publish an `ORDER_NORMALIZE` job after successful order collection.
3. Select a channel-specific normalizer in the worker.
4. Convert the raw response into the common order model.
5. Upsert data into `hub_collected_order`, `hub_collected_order_item`, and `hub_collected_order_delivery`.
6. Serve normalized orders through the external API.
