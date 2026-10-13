using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ProjectmanagementApi.Data;

#nullable disable

namespace ProjectmanagementApi.Migrations
{
    /// <summary>
    /// Makes Projects.SeqNo atomic: numbers now come from a SQL Server SEQUENCE and the column is unique.
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261011120000_MakeProjectSeqNoAtomic")]
    public partial class MakeProjectSeqNoAtomic : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Old code could hand out duplicates. Renumber ONLY if duplicates exist, so clean data keeps its numbers.
            migrationBuilder.Sql(@"
                IF EXISTS (SELECT 1 FROM dbo.Projects GROUP BY SeqNo HAVING COUNT(*) > 1)
                BEGIN
                    ;WITH CTE AS (
                        SELECT Id, ROW_NUMBER() OVER (ORDER BY CreatedAt ASC, Id ASC) AS RowNum
                        FROM dbo.Projects
                    )
                    UPDATE p SET p.SeqNo = CTE.RowNum
                    FROM dbo.Projects p INNER JOIN CTE ON p.Id = CTE.Id;
                END");

            // 2. Create the sequence, starting right after the current highest number.
            migrationBuilder.Sql(@"
                IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = N'ProjectSeqNo')
                BEGIN
                    DECLARE @start int = ISNULL((SELECT MAX(SeqNo) FROM dbo.Projects), 0) + 1;
                    DECLARE @sql nvarchar(max) = N'CREATE SEQUENCE dbo.ProjectSeqNo AS int START WITH ' + CAST(@start AS nvarchar(11)) + N' INCREMENT BY 1 NO CYCLE';
                    EXEC (@sql);
                END");

            // 3. Replace the old DEFAULT 0 on the column with NEXT VALUE FOR the sequence.
            migrationBuilder.Sql(@"
                DECLARE @df sysname;
                SELECT @df = dc.name
                FROM sys.default_constraints dc
                INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
                WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Projects') AND c.name = N'SeqNo';
                IF @df IS NOT NULL
                BEGIN
                    DECLARE @drop nvarchar(max) = N'ALTER TABLE dbo.Projects DROP CONSTRAINT ' + QUOTENAME(@df);
                    EXEC (@drop);
                END");
            migrationBuilder.Sql("ALTER TABLE dbo.Projects ADD CONSTRAINT DF_Projects_SeqNo DEFAULT (NEXT VALUE FOR dbo.ProjectSeqNo) FOR SeqNo");

            // 4. Database-level guarantee: no two projects can ever share a number.
            migrationBuilder.DropIndex(name: "IX_Projects_SeqNo", table: "Projects");
            migrationBuilder.CreateIndex(name: "IX_Projects_SeqNo", table: "Projects", column: "SeqNo", unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_Projects_SeqNo", table: "Projects");
            migrationBuilder.CreateIndex(name: "IX_Projects_SeqNo", table: "Projects", column: "SeqNo");

            migrationBuilder.Sql("ALTER TABLE dbo.Projects DROP CONSTRAINT DF_Projects_SeqNo");
            migrationBuilder.Sql("ALTER TABLE dbo.Projects ADD CONSTRAINT DF_Projects_SeqNo_Legacy DEFAULT (0) FOR SeqNo");
            migrationBuilder.Sql("DROP SEQUENCE IF EXISTS dbo.ProjectSeqNo");
        }
    }
}
