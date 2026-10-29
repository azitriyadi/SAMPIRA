package handlers

import (
	"database/sql"
	"time"
)

func scanPickupListRow(rows *sql.Rows, queryType string) (map[string]interface{}, error) {
	var id int
	var userID int
	var collectorID *int
	var trackingNumber string
	var itemDesc *string
	var pickupAddress *string
	var contactPhone *string
	var weightKg *float64
	var categoryID *int
	var ecoReward *float64
	var processingFee *float64
	var photoURL *string
	var isProcessed bool
	var status string
	var createdAt time.Time
	var finalWeightKg *float64
	var finalEcoReward *float64
	var finalProcessingFee *float64
	var verificationNotes *string
	var verifiedAt *time.Time
	var categoryName *string
	var donorName *string
	var collectorName *string
	var payoutMethod *string
	var payoutAccountName *string
	var payoutAccountNumber *string

	var scanErr error
	if queryType == "user" {
		scanErr = rows.Scan(&id, &userID, &collectorID, &trackingNumber, &itemDesc, &pickupAddress, &contactPhone, &weightKg, &categoryID, &ecoReward, &processingFee, &photoURL, &isProcessed, &status, &createdAt, &finalWeightKg, &finalEcoReward, &finalProcessingFee, &verificationNotes, &verifiedAt, &categoryName)
	} else if queryType == "collector" {
		scanErr = rows.Scan(&id, &userID, &collectorID, &trackingNumber, &itemDesc, &pickupAddress, &contactPhone, &weightKg, &categoryID, &ecoReward, &processingFee, &photoURL, &isProcessed, &status, &createdAt, &finalWeightKg, &finalEcoReward, &finalProcessingFee, &verificationNotes, &verifiedAt, &categoryName, &donorName)
	} else {
		scanErr = rows.Scan(&id, &userID, &collectorID, &trackingNumber, &itemDesc, &pickupAddress, &contactPhone, &weightKg, &categoryID, &ecoReward, &processingFee, &photoURL, &isProcessed, &status, &createdAt, &finalWeightKg, &finalEcoReward, &finalProcessingFee, &verificationNotes, &verifiedAt, &categoryName, &donorName, &collectorName, &payoutMethod, &payoutAccountName, &payoutAccountNumber)
	}

	if scanErr != nil {
		return nil, scanErr
	}
	item := map[string]interface{}{
		"id":                   id,
		"user_id":              userID,
		"collector_id":         collectorID,
		"tracking_number":      trackingNumber,
		"item_description":     itemDesc,
		"pickup_address":       pickupAddress,
		"contact_phone":        contactPhone,
		"weight_kg":            weightKg,
		"category_id":          categoryID,
		"eco_reward":           ecoReward,
		"processing_fee":       processingFee,
		"photo_url":            photoURL,
		"is_processed":         isProcessed,
		"status":               status,
		"created_at":           createdAt,
		"final_weight_kg":      finalWeightKg,
		"final_eco_reward":     finalEcoReward,
		"final_processing_fee": finalProcessingFee,
		"verification_notes":   verificationNotes,
		"verified_at":          verifiedAt,
		"category_name":        categoryName,
	}
	item["donor_name"] = optionalString(donorName)
	item["collector_name"] = optionalString(collectorName)
	item["payout_method"] = optionalString(payoutMethod)
	item["payout_account_name"] = optionalString(payoutAccountName)
	item["payout_account_number"] = optionalString(payoutAccountNumber)
	return item, nil
}
