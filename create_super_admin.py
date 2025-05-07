import requests
import sys

def create_super_admin(username, password):
    url = "http://localhost:8000/admin/create-super-admin"
    params = {
        "username": username,
        "password": password
    }
    
    try:
        response = requests.post(url, params=params)
        if response.status_code == 200:
            print("Super admin created successfully!")
        else:
            print(f"Error: {response.json().get('detail', 'Unknown error')}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python create_super_admin.py <username> <password>")
        sys.exit(1)
    
    username = sys.argv[1]
    password = sys.argv[2]
    create_super_admin(username, password) 