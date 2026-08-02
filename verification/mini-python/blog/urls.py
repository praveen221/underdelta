"""Django urlpatterns for the mini-python notes fixture."""

from django.urls import path, re_path

from . import views

urlpatterns = [
    path("articles/", views.list_articles),
    path("articles/<int:pk>/", views.article_detail),
    re_path(r"^health/$", views.health),
]
