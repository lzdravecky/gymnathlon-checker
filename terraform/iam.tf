resource "aws_iam_role" "gymnathlon_checker_role" {
  name = "gymnathlon-checker-role-3arncb5f"
  path = "/service-role/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "gymnathlon_read_gmail_secret" {
  name = "GymnathlonReadGmailSecret"
  role = aws_iam_role.gymnathlon_checker_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "secretsmanager:GetSecretValue"
        Sid      = "ReadGymnathlonGmailSecret"
        Effect   = "Allow"
        Resource = "arn:aws:secretsmanager:eu-central-1:103415318899:secret:gymnathlon/gmail-a0rAzn"
      },
    ]
  })
}

resource "aws_iam_role_policy" "gymnathlon_read_write_state" {
  name = "GymnathlonReadWriteState"
  role = aws_iam_role.gymnathlon_checker_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadWriteGymnathlonState"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
        ]
        Resource = aws_dynamodb_table.gymnathlon_state.arn
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.gymnathlon_checker_role.name
  policy_arn = "arn:aws:iam::103415318899:policy/service-role/AWSLambdaBasicExecutionRole-46675afc-4415-498d-a458-5392999f66bd"
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  thumbprint_list = [
    "ab9d0263244dd0326eb67015705a667e79cfe998"
  ]
}

resource "aws_iam_role" "github_deploy" {
  name = "gymnathlon-github-deploy-role"
  path = "/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }

        Action = "sts:AssumeRoleWithWebIdentity"

        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:sub" = "repo:lzdravecky@163843980/gymnathlon-checker@1352277444:ref:refs/heads/main"
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "gymnathlon-github-deploy-rolePolicy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:UpdateAlias",
        ]

        Resource = aws_lambda_function.gymnathlon_checker.arn
      }
    ]
  })
}

resource "aws_iam_role" "terraform_ci" {
  name = "terraform-ci"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }

        Action = "sts:AssumeRoleWithWebIdentity"

        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:sub" = "repo:lzdravecky@163843980/gymnathlon-checker@1352277444:ref:refs/heads/main"
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "s3_backend_operations" {
  name = "s3-backend-operations"
  role = aws_iam_role.terraform_ci.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        "Effect" : "Allow",
        "Action" : "s3:ListBucket",
        "Resource" : "arn:aws:s3:::gymnathlon-terraform-state-15963",
        "Condition" : {
          "StringEquals" : {
            "s3:prefix" : "gymnathlon-checker/terraform.tfstate"
          }
        }
      },
      {
        "Effect" : "Allow",
        "Action" : ["s3:GetObject", "s3:PutObject"],
        "Resource" : [
          "arn:aws:s3:::gymnathlon-terraform-state-15963/gymnathlon-checker/terraform.tfstate"
        ]
      },
      {
        "Effect" : "Allow",
        "Action" : ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        "Resource" : [
          "arn:aws:s3:::gymnathlon-terraform-state-15963/gymnathlon-checker/terraform.tfstate.tflock"
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy" "terraform_plan_read" {
  name = "terraform-plan-read"
  role = aws_iam_role.terraform_ci.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:GetPolicy",
          "lambda:ListTags",
          "lambda:ListVersionsByFunction",
          "lambda:GetFunctionCodeSigningConfig",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:ListTagsOfResource",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:ListPolicyVersions",
          "iam:GetOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviderTags",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "scheduler:GetSchedule",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetResourcePolicy",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListTagsForResource",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "logs:DescribeLogGroups",
          "logs:ListTagsForResource",
        ]
        Effect   = "Allow"
        Resource = "*"
      },
      {
        Action = [
          "sns:GetTopicAttributes",
          "sns:ListTagsForResource",
          "sns:ListSubscriptionsByTopic",
          "sns:GetSubscriptionAttributes"
        ]
        Effect   = "Allow"
        Resource = "*"
      },
    ]
  })
}