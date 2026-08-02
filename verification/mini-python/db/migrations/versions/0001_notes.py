"""notes table

Revision ID: 0001_notes
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_notes"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column(
            "author_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.Text, unique=True, nullable=False),
    )
    op.create_table(
        "notes_to_tags",
        sa.Column(
            "note_id",
            sa.Integer,
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag",
            sa.Text,
            sa.ForeignKey("tags.tag", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_table("tags", sa.Column("tag", sa.Text, primary_key=True))


def downgrade() -> None:
    op.drop_table("notes_to_tags")
    op.drop_table("notes")
    op.drop_table("tags")
    op.drop_table("users")
