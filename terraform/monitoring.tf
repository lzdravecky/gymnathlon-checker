resource "aws_sns_topic" "gymnathlon_alerts" {
  name = "gymnathlon-alerts"
}

resource "aws_sns_topic_subscription" "gymnathlon_email" {
  topic_arn = aws_sns_topic.gymnathlon_alerts.arn
  protocol  = "email"
  endpoint  = "lukas.zdravecky@gmail.com"
}

resource "aws_cloudwatch_metric_alarm" "gymnathlon_checker_errors" {
  alarm_name        = "gymnathlon-checker-errors"
  alarm_description = "Alert when gymnathlon-checker Lambda has at least one error."

  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  datapoints_to_alarm = 1

  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.gymnathlon_checker.function_name
  }

  alarm_actions = [
    aws_sns_topic.gymnathlon_alerts.arn
  ]

  actions_enabled = true
}

resource "aws_cloudwatch_log_group" "gymnathlon_checker" {
  name              = "/aws/lambda/gymnathlon-checker"
  log_group_class   = "STANDARD"
  retention_in_days = 0
}