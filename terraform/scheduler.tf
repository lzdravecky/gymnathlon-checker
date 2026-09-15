resource "aws_iam_role" "scheduler_role" {
  name = "gymnathlon-scheduler-role"
  path = "/service-role/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRole"

        Principal = {
          Service = "scheduler.amazonaws.com"
        }

        Condition = {
          StringEquals = {
            "aws:SourceAccount" = "103415318899"
          }
        }
      }
    ]
  })
}

resource "aws_iam_policy" "scheduler_execution" {
  name = "Amazon-EventBridge-Scheduler-Execution-Policy-e06ce588-0f3e-45ac-9fe7-3516889269b3"
  path = "/service-role/"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          "${aws_lambda_function.gymnathlon_checker.arn}:*",
          aws_lambda_function.gymnathlon_checker.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "scheduler_execution" {
  role       = aws_iam_role.scheduler_role.name
  policy_arn = aws_iam_policy.scheduler_execution.arn
}

resource "aws_scheduler_schedule" "checker" {
  name       = "gymnathlon-checker-every-15-min"
  group_name = "default"

  schedule_expression          = "rate(15 minutes)"
  schedule_expression_timezone = "Europe/Bratislava"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "${aws_lambda_function.gymnathlon_checker.arn}:prod"
    role_arn = aws_iam_role.scheduler_role.arn
    input    = "{}"

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}

resource "aws_scheduler_schedule" "daily_report" {
  name       = "gymnathlon-daily-report"
  group_name = "default"

  schedule_expression          = "cron(0 9 * * ? *)"
  schedule_expression_timezone = "Europe/Bratislava"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "${aws_lambda_function.gymnathlon_checker.arn}:prod"
    role_arn = aws_iam_role.scheduler_role.arn

    input = jsonencode({
      dailyReport = true
    })

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}