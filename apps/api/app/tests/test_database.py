from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def test_database_connection(database_connection: AsyncConnection) -> None:
    value = await database_connection.scalar(text("SELECT 1"))
    assert value == 1


async def test_migrated_tables_exist(database_connection: AsyncConnection) -> None:
    value = await database_connection.scalar(
        text(
            """
            SELECT count(*)
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('users', 'challenges')
            """
        )
    )
    assert value == 2
