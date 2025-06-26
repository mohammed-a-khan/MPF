import pandas as pd
import os

# Create data for Excel file
data = {
    'testCase': ['TC501-1', 'TC501-2', 'TC501-3', 'TC503-1', 'TC503-2', 'TC503-3', 'TC503-4', 'TC503-5', 
                 'TC503-6', 'TC503-7', 'TC503-8', 'TC503-9', 'TC503-10', 'TC503-11', 'TC502-1', 'TC502-2', 'TC502-3'],
    'testType': ['login', 'login', 'login', 'navigation', 'navigation', 'navigation', 'navigation', 'navigation',
                 'navigation', 'navigation', 'navigation', 'navigation', 'navigation', 'navigation', 'menu-verify', 'menu-verify', 'menu-verify'],
    'username': ['Admin', 'testuser', 'manager', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    'password': ['admin123', 'test123', 'manager123', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    'module': ['', '', '', 'Admin', 'PIM', 'Leave', 'Time', 'Recruitment', 'My Info', 'Performance', 'Dashboard', 
               'Directory', 'Maintenance', 'Buzz', 'Admin', 'PIM', 'Leave'],
    'expectedResult': ['Login successful', 'Login successful', 'Login successful', 'Admin page', 'PIM page', 
                       'Leave page', 'Time page', 'Recruitment page', 'My Info page', 'Performance page', 
                       'Dashboard page', 'Directory page', 'Maintenance page', 'Buzz page', 'Admin menu visible', 
                       'PIM menu visible', 'Leave menu visible'],
    'executeFlag': ['Y'] * 17,
    'environment': ['QA'] * 17,
    'priority': ['high', 'high', 'medium', 'high', 'high', 'medium', 'medium', 'medium', 'low', 'low', 
                 'high', 'low', 'low', 'low', 'medium', 'medium', 'medium']
}

# Create DataFrame
df = pd.DataFrame(data)

# Save to Excel
excel_path = 'test/akhan/data/akhan-combined-test-data.xlsx'
df.to_excel(excel_path, index=False, engine='openpyxl')

print(f"Excel file created at: {os.path.abspath(excel_path)}")