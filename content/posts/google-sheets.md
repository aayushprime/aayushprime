---
title: "Google Sheets as Database?"
date: 2021-12-14T22:46:33+05:45
draft: false 
searchHidden: false
ShowBreadCrumbs: false
ShowToc: true
TocOpen: true
cover:
    image: "/posts/google-sheets/main.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---
I recently learned that Google Sheets can be used as a database (although with caveats I hear). And I love it.  
It is so much **easier** to see what is in the spreadsheet than on a sqlite file.  
Plus, google sheets works everywhere!  
So, to get started, the official way to do this is from the google developers website.
> https://developers.google.com/sheets/api/guides/concepts  

It is not so easy to understand for a beginner(which I am). 
So, upon further looking around I came across this wonderful python library that makes things so much easier.
It's `gspread`.

## How to get started (quickly)
- Go to Google Cloud Console (login of course)
- Create a new project if you haven't already
- Go to API dashboard
![](/posts/google-sheets/1.png)
- Then click enable APIs and Services
- Search for google drive and enable in
- Then click manage to go to this page
![](/posts/google-sheets/2.png)
- Click credentials > create credentials > service account
- Enter a name and URL and click continue
- Select the `Editor` role
![](/posts/google-sheets/3.png)
- Continue and Done!
- Then click on the service account you just created
- Keys > Create New Key > Select JSON
![](/posts/google-sheets/4.png)
- A file should download

You can either add the email to your own google sheets via Share> Invite people and paste this email or create your own spreadsheet.
![](/posts/google-sheets/5.png)

## Python code
Now the code side of things, first of all, install 2 python packages,
`gspread` and `oauth2client`  
`pip install gspread oauth2client` should do the trick.

```py
import gspread
from oauth2client.service_account import ServiceAccountCredentials

scope = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
]
# credentials.json is the file you downloaded from google console
# (rename appropriately)
creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)

client = gspread.authorize(creds)
# the name of your spreadsheet in google sheets
dbname = "googlesheetsname"
sheet = client.open(dbname).sheet1

data = sheet.get_all_records()

row = sheet.row_values(1)
col = sheet.col_values(2)
```

Using the library is very easy. See `gspread` docs for more details
> https://docs.gspread.org/en/latest/
