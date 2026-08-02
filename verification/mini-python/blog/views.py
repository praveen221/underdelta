"""Stub Django views referenced by blog/urls.py."""


def list_articles(request):
    return []


def article_detail(request, pk: int):
    return {"id": pk}


def health(request):
    return {"ok": True}
