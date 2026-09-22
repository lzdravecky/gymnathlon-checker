# Gymnathlon Checker

A production-style Node.js monitor for Gymnathlon course availability, built as a hands-on DevOps project.

The application monitors Gymnathlon Baby courses in Košice, sends an email when course availability changes, and sends a daily status report. The current version runs serverlessly on AWS and combines application CI/CD, Infrastructure as Code, remote Terraform state, OIDC authentication, monitoring, and persistent state.

## Architecture

```text
EventBridge Scheduler
        |
        v
 Lambda alias: prod
        |
        v
 Published Lambda version
        |
        +--> Gymnathlon web
        +--> Secrets Manager --> Gmail OAuth
        +--> DynamoDB --> persistent state
        |
        v
 CloudWatch Logs / Metrics
        |
        v
      Alarm
        |
        v
       SNS
        |
        v
 email notification
```

The scheduled production workload targets the stable `prod` Lambda alias. Application deployments publish an immutable Lambda version and then move the alias to the newly published version.

## CI/CD and Infrastructure as Code

The project has two separate GitHub Actions workflows with different responsibilities:

```text
Application CI/CD
push / pull request
        |
        +--> npm ci
        +--> ESLint
        +--> tests
        |
        v
push to main
        |
        v
OIDC --> AWS deploy role
        |
        +--> package Lambda
        +--> deploy code
        +--> publish Lambda version
        +--> update prod alias


Terraform CI
terraform/** change or scheduled run
        |
        +--> terraform fmt -check
        +--> terraform init
        +--> terraform validate
        +--> terraform plan -detailed-exitcode
        |
        v
OIDC --> dedicated terraform-ci role
        |
        v
remote S3 state
```

GitHub authenticates to AWS through OpenID Connect (OIDC), so permanent AWS access keys are not stored in GitHub. Application deployment and Terraform CI use separate least-privilege IAM roles.

Terraform CI intentionally performs validation and planning only. Infrastructure changes are reviewed before they are applied.

## Terraform

The AWS infrastructure is represented in the `terraform/` directory and split by concern:

```text
terraform/
├── providers.tf
├── lambda.tf
├── iam.tf
├── dynamodb.tf
├── scheduler.tf
├── secrets.tf
├── monitoring.tf
└── .terraform.lock.hcl
```

Terraform manages the infrastructure and configuration around the application, including:

- AWS Lambda configuration
- IAM roles, policies, and policy attachments
- DynamoDB state table
- EventBridge Scheduler schedules
- Secrets Manager secret metadata
- CloudWatch log group and error alarm
- SNS alerting
- GitHub OIDC provider and CI/CD IAM roles

The infrastructure originally existed in AWS and was adopted into Terraform using a brownfield import workflow. Existing resources were imported into Terraform state and the HCL configuration was reconciled until `terraform plan` reported no unintended changes.

### Remote state

Terraform state is stored in an encrypted S3 backend rather than in the Git repository.

The backend uses:

- S3 server-side encryption
- S3 versioning for state recovery
- public access blocking
- native Terraform S3 state locking via `use_lockfile = true`

The state file and lock file are intentionally excluded from Git.

### Ownership boundary

Terraform owns infrastructure and infrastructure configuration. The application deployment workflow owns Lambda application code, published versions, and the `prod` alias.

This separation allows application code to be released without Terraform attempting to overwrite each deployment.

## Reliability and monitoring

The checker includes several reliability mechanisms:

- retry for transient Gymnathlon HTTP/network failures
- structured and categorized error logging
- persistent alert state in DynamoDB
- CloudWatch Logs and Lambda error metrics
- CloudWatch alarm connected to SNS email notifications
- EventBridge Scheduler retry policy

Retries are limited to the external Gymnathlon fetch path rather than retrying the complete application flow, avoiding unnecessary repetition of side effects such as email sending or state updates.

## Tech stack

- Node.js 24
- Gmail API / OAuth 2.0
- Terraform
- GitHub Actions
- GitHub OIDC
- AWS Lambda
- Amazon EventBridge Scheduler
- AWS Secrets Manager
- Amazon DynamoDB
- Amazon CloudWatch
- Amazon SNS
- Amazon S3 remote Terraform state
- IAM / least-privilege roles and policies
- Docker / Docker Compose / GHCR (legacy Level 2 version)

## Legacy Docker version

The completed Docker version of the project is preserved in the Git tag:

`level-2-docker`

The corresponding Docker image is preserved in GHCR as:

`ghcr.io/lzdravecky/gymnathlon-checker:1.0`

This version predates the AWS migration and uses local files for Gmail OAuth credentials and persistent state.

### Required local files

The legacy Docker version requires three local runtime files:

```text
gymnathlon-runtime/
├── compose.yaml
├── credentials.json
├── token.json
└── state.json
```

These files are intentionally not stored in Git.

### OAuth credentials and token

`credentials.json` identifies the Google OAuth application. `token.json` contains the authorization granted by a Google user to that application.

Conceptually:

```text
credentials.json
        |
        v
OAuth authorization in browser
        |
        v
token.json
```

Neither file should be committed to Git.

### Legacy state

`state.json` stores the IDs of courses for which an availability alert has already been sent.

Example:

```json
{
  "alertedCourses": []
}
```

The current AWS version no longer uses this file. Persistent application state is stored in DynamoDB.

### Running the legacy Docker version

To inspect the old source code locally:

```bash
git checkout level-2-docker
```

To return to the current version:

```bash
git checkout main
```

The legacy Docker image can be pulled and run through Docker Compose:

```bash
docker compose pull
docker compose run --rm checker
```

## Project evolution

```text
Level 1
Node.js + Gmail OAuth + GitHub Actions + cron-job.org

Level 2
Docker + Docker Compose + GHCR + CI
        |
        +--> Git tag: level-2-docker
        +--> Docker image: gymnathlon-checker:1.0

Level 3
AWS serverless migration
        |
        +--> Lambda + EventBridge Scheduler
        +--> Secrets Manager + DynamoDB
        +--> CloudWatch + SNS
        +--> GitHub Actions deployment via OIDC
        +--> published Lambda versions + prod alias

Level 4
Terraform / Infrastructure as Code
        |
        +--> brownfield AWS resource adoption
        +--> remote encrypted/versioned S3 state
        +--> native state locking
        +--> Terraform CI via dedicated OIDC role
        +--> least-privilege IAM
        +--> scheduled plan/drift detection
        +--> runtime retry and structured error handling
```

## What this project demonstrates

The project intentionally evolved from a small local automation script into a production-style cloud deployment. It demonstrates containerization, CI/CD, serverless AWS architecture, persistent cloud state, secrets handling, monitoring and alerting, IAM/OIDC, Terraform adoption of existing infrastructure, remote state management, and separation of application deployment from infrastructure management.
