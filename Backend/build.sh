#!/usr/bin/env bash
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input --ignore=*.eot --ignore=*.woff --ignore=*.ttf --ignore=*.svg
python manage.py migrate