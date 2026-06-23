# Medical Promotion Portal

Independent folder: `/medical-rep/`

Entry points:
- `medical-rep/index.html`: medical rep login by employee number and birth date.
- `medical-rep/dashboard.html`: read-only medical rep dashboard.
- `medical-rep/admin.html`: upload/update setup files.

Firestore collections created by the portal:
- `medicalReps`: medical rep login data.
- `medicalRepAreaRules`: direct area attribution rules by Team / Medrep / Item Name / Area.
- `medicalRepOtherShares`: allocation percentages for Area = اخرين / آخرين / others.
- `medicalRepTargets`: optional future targets by year/month/medrep/item.

Existing collections read by the portal:
- `orders`: only invoiced/hidden-after-export orders are used.
- `pharmacies`: used to resolve pharmacy area when the order itself does not carry an area field.

Core logic:
- If an invoiced sale line is in a direct area and the uploaded area rule matches item + area + medrep, the full line value and quantity are counted for that medical rep.
- If an invoiced sale line is in Area = اخرين / آخرين / others, the line value and quantity are multiplied by the uploaded `Percentage from others` for the same item and medrep.
- The medical rep portal is read-only and cannot create, approve, edit, delete, export, or alter sales orders.

Admin upload files:
1. Medical reps login file:
   - Employee No
   - Birth Date
   - Medrep
   - Team
   - Active

2. Area rules file:
   - Team
   - Medrep
   - Item Name
   - Area

3. Other shares file:
   - Team
   - Item Name
   - Medrep
   - Percentage from others

4. Targets file:
   - Year
   - Month
   - Team
   - Medrep
   - Item Name
   - Target Value
   - Target Qty

## Firebase field mapping confirmed on 2026-06-23

The dashboard reads invoiced orders from `orders` using these indicators:
- `status == orders_staff_hidden`
- `orderStaffStatus == orders_staff_hidden`
- `hiddenByOrderStaff == true`

Order item fields used:
- `items[].name`
- `items[].qty`
- `items[].price`
- `items[].total`

Pharmacy area mapping:
- Order field: `orders.pharmacyCode`
- Pharmacy field: `pharmacies.pharmacy_code`
- Area field: `pharmacies.area`

This means `orders` does not need an area field. The portal maps the order to the pharmacy, then reads the pharmacy area.
