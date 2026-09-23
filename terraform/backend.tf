terraform {
  backend "s3" {
    bucket       = "securebank-terraform-state-379367335704"
    key          = "securebank/dev/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
  }
}