resource "aws_dynamodb_table" "gymnathlon_state" {
  name         = "gymnathlon-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}