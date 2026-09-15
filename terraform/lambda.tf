resource "aws_lambda_function" "gymnathlon_checker" {
  filename      = "../gymnathlon-lambda.zip"
  function_name = "gymnathlon-checker"
  role          = aws_iam_role.gymnathlon_checker_role.arn
  handler       = "monitor.handler"
  runtime       = "nodejs24.x"
  memory_size   = 128
  timeout       = 30

  lifecycle {
    ignore_changes = [
      filename
    ]
  }
}