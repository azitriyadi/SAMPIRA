package migrations

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"strings"
)

//go:embed 002_facility_reports.sql
var facilityReportsDDL string

//go:embed 003_facility_handling.sql
var facilityHandlingDDL string

//go:embed 004_precise_locations.sql
var preciseLocationsDDL string

// ApplyFacilityReports runs additive, individually retryable DDL.
func ApplyFacilityReports(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, facilityReportsDDL)
}

func ApplyFacilityHandling(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, facilityHandlingDDL)
}

func ApplyPreciseLocations(ctx context.Context, db *sql.DB) error {
	return applySQL(ctx, db, preciseLocationsDDL)
}

func applySQL(ctx context.Context, db *sql.DB, ddl string) error {
	for i, statement := range strings.Split(ddl, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migration statement %d: %w", i+1, err)
		}
	}
	return nil
}
