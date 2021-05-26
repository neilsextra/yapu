import attributes as attrs
from matplotlib import pyplot
from flask import Flask, Blueprint, render_template, request, send_file, Response
from flask_bower import Bower
import io
from os import environ
import datetime
import string
import json
import sys
import azure
import os
import requests
import time
import re
import numpy as np
import pandas as pd
import hashlib
import datetime

from io import BytesIO
from requests import get, post
from pathlib import Path
from pandas_profiling import ProfileReport
from zipfile import ZipFile, ZipInfo

from PyPDF2 import PdfFileReader, PdfFileWriter

from azure.storage.filedatalake import DataLakeServiceClient
from azure.core._match_conditions import MatchConditions
from azure.storage.filedatalake._models import ContentSettings

import matplotlib
matplotlib.use('Agg')

views = Blueprint('views', __name__, template_folder='templates')

app = Flask(__name__)

Bower(app)

app.register_blueprint(views)

my_content_settings = ContentSettings(content_type='application/pdf')


class CustomEncoder(json.JSONEncoder):

    def key_to_json(self, data):
        if data is None or isinstance(data, (bool, int, str)):
            return data

        return str(data)

    def default(self, o):
        #        print(type(o))

        if isinstance(o, pd.Series):
            return self.default(o.to_dict())

        if isinstance(o, pd.DataFrame):
            return o.to_json()

        if isinstance(o, np.integer):
            return o.tolist()

        if isinstance(o, dict):
            return {self.key_to_json(key): self.default(o[key]) for key in o}

        if isinstance(o, (datetime.date, datetime.datetime)):
            return o.isoformat()

        return str(o)


def log(f, message):
    message = "%s : %s " % (str(datetime.datetime.now()), message)
    print(message)
    f.write("%s\n")
    f.flush()


def get_configuration():
    debug_file = "debug.log"

    try:
        import configuration as config

        debug_file = config.DEBUG_FILE

    except ImportError:
        pass

    debug_file = environ.get('DEBUG_FILE', debug_file)

    return {
        'debug_file': debug_file
    }


def log(f, message):
    f.write(str(datetime.datetime.now()))
    f.write(' : ')
    f.write(message)
    f.write('\n')
    f.flush()


def get_file_system_client(account, token, container):

    service_client = DataLakeServiceClient(account_url="{}://{}.dfs.core.windows.net".format(
        "https", account), credential=token)

    return service_client.get_file_system_client(container)


def create_file(container_client, container_directory, uploaded_file, data, data_offset, data_length):
    directory_client = container_client.get_directory_client(
        container_directory)

    file_client = directory_client.get_file_client(uploaded_file)

    file_client.create_file()

    print("Creating File")

    file_client.append_data(data,  offset=data_offset, length=data_length)
    print("data_offset: %d : %d" % (data_offset, data_length))

    print("Create File Complete")


def append_file(container_client, container_directory, uploaded_file, data, data_offset, data_length):
    directory_client = container_client.get_directory_client(
        container_directory)

    file_client = directory_client.get_file_client(uploaded_file)

    print("data_offset: %d : %d" % (data_offset, data_length))

    file_client.append_data(data, offset=data_offset, length=data_length)


def flush_file(container_client, container_directory, uploaded_file, data_length):
    directory_client = container_client.get_directory_client(
        container_directory)
    file_client = directory_client.get_file_client(uploaded_file)

    print("Data Length: %d" % int(data_length))

    file_client.flush_data(int(data_length))


def write_string_to_file(directory_client, file_path, file_name, string_data):
    file_client = directory_client.get_file_client(file_name)

    file_client.create_file()

    data_buffer = bytes(string_data, 'utf-8')

    file_client.append_data(data_buffer, offset=0, length=len(data_buffer))
    file_client.flush_data(len(data_buffer))

    metadata = {'pathname': file_path}

    file_client.set_metadata(metadata)


def write_to_catalog(container_client, file_path, html_data, json_data):
    directory_client = container_client.get_directory_client("@catalog")

    try:
        directory_client.create_directory()
    except Exception as e:
        pass

    hash = hashlib.md5()
    hash.update(bytes(file_path, 'utf-8'))

    html_filename = "%s.html" % hash.hexdigest()
    json_filename = "%s.json" % hash.hexdigest()

    write_string_to_file(directory_client, file_path, html_filename, html_data)
    write_string_to_file(directory_client, file_path, json_filename, json_data)

    return hash.hexdigest()


def create_variables_profile(description_variables_profile):
    variables_profile = {}

    for key in description_variables_profile.keys():
        variable_attributes = {}

        for attribute in description_variables_profile[key].keys():

            if attribute in attrs.attributes:
                variable_attributes[attribute] = description_variables_profile[key][attribute]

        variables_profile[key] = variable_attributes

    return variables_profile


def build_profile(file_system_client, file_client, directory, filename):

    download = file_client.download_file()

    stream = BytesIO(download.readall())

    df = pd.read_csv(stream)

    profile = ProfileReport(df, title="YAPU - Summary - '%s'" % filename,
                            minimal=True, progress_bar=False, html={"minify_html": True})

    html_data = fix_html(profile.to_html())

    file_path = (directory + filename).replace("//", "/", len(directory))
    
    description = profile.get_description()
    
    properties = {
        'analysis': description['analysis'],
        'messages': description['messages'],
        'variables': create_variables_profile(description['variables'])
    }

    columns = []

    for key in profile.get_description()['variables'].keys():
        columns.append(key)

    hash = write_to_catalog(
        file_system_client, file_path, html_data, json.dumps(
            properties, indent=4, cls=CustomEncoder))

    metadata = {'catalog': hash,
                'columns' : str(columns)}

    file_client.set_metadata(metadata)

    return html_data


def get_profile(file_system_client, filename, suffix="html"):

    directory_client = file_system_client.get_directory_client("/@catalog")

    file_client = directory_client.get_file_client("%s.%s" % (filename, suffix))

    return file_client.download_file().readall()


def upload_zip_archive(filename, html, json):

    zip_output = BytesIO()

    with ZipFile(zip_output, 'w') as zip_archive:
        html_file = ZipInfo('%s/profile.html' % filename)
        zip_archive.writestr(html_file, html)
        
        json_file = ZipInfo('%s/profile.json' % filename)
        zip_archive.writestr(json_file, json)

    return BytesIO(zip_output.getbuffer())

def fix_html(html):
    html = html.replace(
        "Report generated with <a href=https://github.com/pandas-profiling/pandas-profiling>pandas-profiling</a>",
        "YAPU Powered Report - using Pandas Profiling")
    html = html.replace("<a href=https://github.com/pandas-profiling/pandas-profiling>pandas-profiling v2.9.0</a>", 
                                "YAPU - Version 1.0.0, Pandas v2.9.0")

    return html


@ app.route("/query", methods=["GET"])
def query():
    try:
        account = request.values.get('account')  # the Datalake Account
        token = request.values.get('token')  # The Datalake SAF token
        container = request.values.get('container')  # the Datalake Container
    
        directory = request.values.get('directory')  # the Datalake Directory

        print("%s : %s : %s : %s" % (account, token, container, directory))

        file_system_client = get_file_system_client(account, token, container)

        output = []
        paths = []

        path_list = file_system_client.get_paths(
            path=directory, recursive=False)

        for path in path_list:
            paths.append({
                "path": path.name,
                "is_directory": path.is_directory
            })

        output.append({
            "paths": paths,
            "status": "OK"
        })

        return json.dumps(output, sort_keys=True), 200

    except Exception as e:
        print(str(e))

        output = []

        output.append({
            "code": 500,
            "message": str(e),
            "status": "FAIL"
        })

        return json.dumps(output, sort_keys=True), 500


@ app.route("/metadata", methods=["GET"])
def metadata():
    configuration = get_configuration()

    f = open(configuration['debug_file'], 'a')

    log(f, '[METADATA] start')
    account = request.values.get('account')  # The Datalake Account
    token = request.values.get('token')  # The Datalake SAF token
    container = request.values.get('container')  # the Datalake Container
    directory = request.values.get('directory')  # the Datalake Directory
    filename = request.values.get('filename')  # the Datalake Filename

    file_system_client = get_file_system_client(account, token, container)

    directory_client = file_system_client.get_directory_client(directory)

    file_client = directory_client.get_file_client(filename)

    file_properties = file_client.get_file_properties()

    print(file_properties)

    properties = {
        'name': file_properties.name,
        'creation_time': file_properties.creation_time,
        'last_modified': file_properties.last_modified,
        'size': file_properties.size,
        'metadata': file_properties.metadata
    }

    log(f, '[METADATA]  %s' % json.dumps(
        properties, indent=4, cls=CustomEncoder))

    f.close()

    return json.dumps(properties, indent=4, cls=CustomEncoder), 200


@ app.route("/profile", methods=["GET"])
def profile():
    account = request.values.get('account')  # The Datalake Account
    token = request.values.get('token')  # The Datalake SAF token
    container = request.values.get('container')  # the Datalake Container
    directory = request.values.get('directory')  # the Datalake Directory
    filename = request.values.get('filename')  # the Datalake Filename

    try:
        file_system_client = get_file_system_client(account, token, container)

        print("directory: %s, filename: %s" % (directory, filename))

        directory_client = file_system_client.get_directory_client(directory)

        file_client = directory_client.get_file_client(filename)

        properties = file_client.get_file_properties()

        html_data = ""

        if properties.get("metadata") is not None:
            if "catalog" in properties["metadata"]:

                html_data = get_profile(
                    file_system_client, properties['metadata']['catalog'], "html")


            else:
                html_data = build_profile(
                    file_system_client, file_client, directory, filename)
        else:
            html_data = build_profile(
                file_system_client, file_client, directory, filename)

        return html_data, 200

    except Exception as e:
        print("profile: " + str(e))

        return str(e), 500


@ app.route("/regenerate", methods=["GET"])
def regenerate():
    account = request.values.get('account')  # The Datalake Account
    token = request.values.get('token')  # The Datalake SAF token
    container = request.values.get('container')  # the Datalake Container
    directory = request.values.get('directory')  # the Datalake Directory
    filename = request.values.get('filename')  # the Datalake Filename

    try:
        file_system_client = get_file_system_client(account, token, container)

        print("directory: %s, filename: %s" % (directory, filename))

        directory_client = file_system_client.get_directory_client(directory)

        file_client = directory_client.get_file_client(filename)
 
        html_data = build_profile(
            file_system_client, file_client, directory, filename)
  
        return html_data, 200
        

    except Exception as e:
        print("profile: " + str(e))

        return str(e), 500


@ app.route("/retreive", methods=["GET"])
def retreive():
    account = request.values.get('account')
    token = request.values.get('token')
    container = request.values.get('container')

    file_system_client = get_file_system_client(account, token, container)

    directory_client = file_system_client.get_directory_client("/")

    file_client = directory_client.get_file_client("@catalog.zip")

    file_client.create_file()

    download_stream = file_client.download_file()

    return Response(io.BytesIO(download_stream.readall()), mimetype='application/zip')


@ app.route("/upload", methods=["POST"])
def upload():
    configuration = get_configuration()

    f = open(configuration['debug_file'], 'a')

    log(f, '[UPLOAD] commenced uploading')

    account = request.values.get('account')
    token = request.values.get('token')
    container = request.values.get('container')
    directory = request.values.get('directory')

    offset = int(request.values.get('offset'))
    chunk = int(request.values.get('chunk'))
    size = int(request.values.get('size'))

    print("[UPLOAD] Offset: %d, Chunk: %d, Size: %d" % (offset, chunk, size))

    file_system_client = get_file_system_client(account, token, container)

    output = []

    try:
        uploaded_files = request.files

        log(f, '[UPLOAD] files %d' % (len(uploaded_files)))

        for uploaded_file in uploaded_files:
            print("File Name: '%s'" % uploaded_file)
            file_content = request.files.get(uploaded_file)

            if chunk == 0:
                create_file(file_system_client, directory,
                            uploaded_file, file_content, offset, size)
            else:
                append_file(file_system_client, directory,
                            uploaded_file, file_content, offset, size)

            output.append({
                "filename": uploaded_file,
                "status": "OK"
            })

        log(f, "[UPLOAD] Offset: %d, Chunk: %d, Size: %d" %
            (offset, chunk, size))
        f.close()

        return json.dumps(output, sort_keys=True), 200

    except Exception as e:

        print(str(e))

        log(f, str(e))
        f.close()

        output.append({
            "status": 'fail',
            "error": str(e)
        })

        return json.dumps(output, sort_keys=True), 500


@ app.route("/commit", methods=["GET"])
def commit():
    output = []

    configuration = get_configuration()

    f = open(configuration['debug_file'], 'a')

    log(f, '[COMMIT] commencing')

    account = request.values.get('account')
    token = request.values.get('token')
    container = request.values.get('container')
    directory = request.values.get('directory')
    uploaded_file = request.values.get('filename')
    file_size = request.values.get('filesize')

    file_system_client = get_file_system_client(account, token, container)
    flush_file(file_system_client, directory, uploaded_file, int(file_size))

    f.close()

    output.append({
        "filename": uploaded_file,
        "status": "OK"
    })

    return json.dumps(output, sort_keys=True), 200


@ app.route("/download", methods=["GET"])
def download():

    configuration = get_configuration()

    f = open(configuration['debug_file'], 'a')

    log(f, '[DOWNLOAD] commencing')

    account = request.values.get('account')
    token = request.values.get('token')
    container = request.values.get('container')
    directory = request.values.get('directory')
    filename = request.values.get('filename')

    file_system_client = get_file_system_client(account, token, container)
    directory_client = file_system_client.get_directory_client(directory)
    file_client = directory_client.get_file_client(filename)

    properties = file_client.get_file_properties()

    if properties.get("metadata") is not None:
        if "catalog" in properties["metadata"]:
            html_data = get_profile(
                file_system_client, properties['metadata']['catalog'], "html")
            json_data = get_profile(
                file_system_client, properties['metadata']['catalog'], "json")
        
        f.close()

        zip = upload_zip_archive(filename, html_data, json_data)
        
        return send_file(zip, mimetype='zip', as_attachment=True, attachment_filename = 'catalog.zip') 

    return"Catalogue not found", 500


@ app.route("/backup", methods=["GET"])
def backup():
    
    return send_file(zip, mimetype='zip', as_attachment=True, attachment_filename = 'catalog.zip') 


@ app.route("/")
def start():
    return render_template("main.html")


if __name__ == "__main__":
    PORT = int(environ.get('PORT', '8080'))
    app.run(host='0.0.0.0', port=PORT)
