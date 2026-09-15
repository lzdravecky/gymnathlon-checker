resource "aws_secretsmanager_secret" "gmail" {
  name        = "gymnathlon/gmail"
  description = "Gmail OAuth credentials and token for Gymnathlon Checker"
}

