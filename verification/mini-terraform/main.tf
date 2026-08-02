# Mini Terraform notes — smoke fixture for Underdelta Rung 8.

resource "aws_vpc" "this" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_s3_bucket" "notes" {
  bucket = "mini-terraform-notes"
}

resource "aws_dynamodb_table" "items" {
  name         = "mini-terraform-items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_lambda_function" "api" {
  function_name = "mini-terraform-api"
  role          = "arn:aws:iam::123456789012:role/mini-terraform"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "api.zip"
}

module "network" {
  source = "./modules/network"

  name = "mini-terraform"
}
