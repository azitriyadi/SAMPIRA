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

// ApplyFacilityReports runs additive, individually retryable DDL.
func ApplyFacilityReports(ctx context.Context, db *sql.DB) error {
	for i, statement := range strings.Split(facilityReportsDDL, ";") {
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
