# Deployment readiness and planning estimate

No public deployment was performed or authorized. The application is reviewable locally, but it is not approved for real customer data. The list below is the remaining production work, not a claim that local tests cover operational readiness.

## Candidate AWS topology

For a small Australia-hosted installation, use `ap-southeast-2` (Sydney): one public HTTPS Application Load Balancer; separate Next.js and NestJS ECS Fargate services behind it; private RDS for PostgreSQL with pgvector; private S3 bucket; Secrets Manager; CloudWatch logs/alarms; and an SMTP provider. API, ingestion worker and database run in private subnets. Add a NAT gateway only if private egress is required and no cheaper controlled egress design is appropriate. Ollama is not part of this baseline; hosted AI is a separate privacy, network and cost decision.

This topology is a planning option, not an infrastructure template. The API currently uses process-local polling to claim durable SQL jobs. Before horizontal API scaling, split the worker into a separately scaled process or prove the polling and lease policy under real load. Pin container images by digest and deploy database migrations as a release step.

## Dated monthly cost planning range

Planning date: **2026-10-16**. Currency: **USD**, before tax, credits, negotiated discounts or AUD conversion. For a low-traffic, single-AZ demonstration baseline in Sydney, budget approximately **$90–$170/month**. This is an engineering planning range, not a generated AWS Pricing Calculator estimate or quote. It assumes 730 hours/month, one small always-on Fargate task each for web and API (about 0.25 vCPU/0.5 GB each), one `db.t4g.small` RDS PostgreSQL instance with 20 GB gp3 storage, one ALB with low traffic, 20 GB S3 Standard, modest logs/requests, and low internet egress. No NAT gateway, WAF, paid support, domain registration, high availability, or external AI is included.

| Cost area                         | Rough monthly allowance | Main assumption                                                                                               |
| --------------------------------- | ----------------------: | ------------------------------------------------------------------------------------------------------------- |
| Fargate web + API                 |                 $20–$45 | Two small Linux tasks, continuous 730 hours; actual price depends on architecture and Sydney rates.           |
| RDS PostgreSQL                    |                 $35–$75 | One small Single-AZ DB plus 20 GB storage; actual class/engine rate must be selected in the calculator.       |
| Application Load Balancer         |                 $20–$35 | One always-on ALB and low LCU consumption; rules and traffic affect usage.                                    |
| S3, logs, requests and low egress |                  $5–$15 | Small synthetic workload; retention and downloads can dominate this line.                                     |
| **Indicative total**              |            **$90–$170** | Rounded range includes modest price/usage margin; individual service estimates are not additive exact quotes. |

This estimate intentionally exposes uncertainty: AWS's public service pricing pages and calculator support region-specific configurations, but the pages available for this research do not expose a stable Sydney quote for the selected RDS/Fargate settings in static text. Use the [AWS Pricing Calculator](https://calculator.aws/) and select Sydney, Linux/ARM or Linux/x86, exact task counts, RDS class/storage/backup retention, ALB traffic, S3 usage, CloudWatch retention and internet egress before creating anything. AWS bills Fargate based on provisioned vCPU, memory and storage for task duration; RDS charges by class/runtime and storage; Multi-AZ roughly doubles DB compute and storage; S3 charges depend on storage, requests and data transfer. The first 100 GB/month internet data out is currently aggregated across AWS services and regions (subject to AWS exclusions). See [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [RDS on-demand and Multi-AZ billing](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_OnDemandDBInstances.html), [S3 pricing](https://aws.amazon.com/s3/pricing/), and [calculator guidance](https://docs.aws.amazon.com/pricing-calculator/latest/userguide/getting-started.html).

Add approximately **$40–$70/month** if a continuously running NAT gateway is needed, plus NAT data processing. A multi-AZ RDS configuration adds roughly another instance's compute/storage cost; a second application task, backups beyond included allowances, WAF, monitoring, email, domain, support, and data transfer add further costs. Prices can change; no free tier or promotional credit is assumed. Recalculate on the day of deployment and set billing alerts before provisioning.

## Production checklist

- [ ] Run local CI-equivalent checks and review the exact commit; run hosted GitHub Actions after repository setup/approval.
- [ ] Complete an independent threat model, dependency/image review, accessibility review, load test and security review.
- [ ] Build production images, pin digests, run as non-root, define health/readiness endpoints, resource limits and graceful shutdown.
- [ ] Use one HTTPS origin, ACM certificate, private backend/database networks, host-only Secure cookies, narrow proxy trust and rate-limit review.
- [ ] Put secrets in a managed secret store; rotate existing development credentials and never reuse `.env` values.
- [ ] Create dedicated migration and least-privilege runtime DB roles; run forward migrations with backup/restore and recovery rehearsal.
- [ ] Confirm pgvector availability/version in the selected RDS engine and extension permissions before any data migration.
- [ ] Configure private S3 access and bucket-default encryption (or `STORAGE_SERVER_SIDE_ENCRYPTION=AES256` when supported), lifecycle/retention, object cleanup, backup/recovery and malware scanning policy.
- [ ] Configure verified SMTP sender, bounce handling, delivery monitoring and token-safe operational logs.
- [ ] Tighten production CSP, dependency timeouts, request limits, retention/cleanup, alerting and incident runbooks.
- [ ] Decide whether inference may access customer content, where it runs, model license, model version, dimensions, retention and review policy. Re-index all documents if embeddings change.
- [ ] Produce calculator export for selected region/traffic, budget alerts, operational owner and teardown plan.

No public service, AWS resource, DNS record or paid service was created. The user-approved `nomic-embed-text:latest` embedding model was downloaded for local testing; no model or external AI service was provisioned in the cloud.
