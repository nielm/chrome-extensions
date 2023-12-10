Instruction to get started with git + ssh.

Add your public key to https://github.com/settings/ssh.

```shell
mkdir git
cd git
git clone https://github.com/birnenlabs/chrome-extensions


cd chrome-extensions
git remote set-url origin git+ssh://git@github.com/birnenlabs/chrome-extensions
```

Testing

```shell
git add -A
git commit -am "Update README.md"
git push
```
