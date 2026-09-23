provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "SecureBank"
      Environment = "dev"
      ManagedBy   = "Terraform"
    }
  }
}