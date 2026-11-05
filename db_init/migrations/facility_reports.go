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

// ApplyFacilityReports runs additive, individually retryable DDL.
func ApplyFacilityReports(ctx context.Context, db *sql.DB) error {
	return applyFacilityDDL(ctx, db, facilityReportsDDL)
}

func ApplyFacilityHandling(ctx context.Context, db *sql.DB) error {
	return applyFacilityDDL(ctx, db, facilityHandlingDDL)
}

func applyFacilityDDL(ctx context.Context, db *sql.DB, ddl string) error {
	for i, statement := range strings.Split(ddl, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("facility migration statement %d: %w", i+1, err)
		}
	}
	return nil
}
