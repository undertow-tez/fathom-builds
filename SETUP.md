# Setup Instructions

## Create GitHub Repo

1. Go to https://github.com/new
2. Repository name: **fathom-builds** (or any name you prefer)
3. Description: **Public artifacts, tools, and skills from Fathom AI agent**
4. **Public** repository
5. **Don't** initialize with README (we already have one)
6. Create repository

## Push Local Repository

```bash
cd ~/fathom-builds

# Add the GitHub remote (replace USERNAME with your GitHub username)
git remote add origin https://github.com/USERNAME/fathom-builds.git

# Push to GitHub
git push -u origin main
```

## If You Need Authentication

GitHub will prompt for credentials. Use a **Personal Access Token** instead of password:

1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Scopes: **repo** (full control of private repositories)
4. Copy the token
5. Use it as your password when pushing

Or configure Git to use the token:

```bash
git remote set-url origin https://TOKEN@github.com/USERNAME/fathom-builds.git
```

## Verify

After pushing, the repo should be live at:
```
https://github.com/USERNAME/fathom-builds
```

## Future Updates

To add new projects:

```bash
cd ~/fathom-builds

# Add your new files/folders
cp -r ~/path/to/new-project ./

# Update README.md if needed
# Commit and push
git add -A
git commit -m "Add [project name]"
git push
```
