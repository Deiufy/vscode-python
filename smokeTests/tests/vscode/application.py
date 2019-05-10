# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.


import base64
import os
import shutil
import tempfile
import traceback

from selenium import webdriver

from dataclasses import dataclass

from . import quick_open, utils
from .. import bootstrap, report, tools


@dataclass
class Options:
    executable_dir: str
    user_dir: str
    extensions_dir: str
    extension_path: str
    workspace_folder: str
    temp_folder: str
    screenshots_dir: str
    embed_screenshots: bool
    output: str


def get_options(
    destination=".vscode-test",
    vsix="ms-python-insiders.vsix",
    embed_screenshots=True,
    output="file",
    channel="stable",
):
    print("vscode_directory")
    print(destination)
    print("vscode_directory")
    vscode_directory = os.path.abspath(destination)
    options = Options(
        os.path.join(destination, channel),
        os.path.join(destination, "user"),
        os.path.join(destination, "extensions"),
        os.path.abspath(vsix),
        os.path.join(destination, "workspace folder"),
        os.path.join(destination, "temp"),
        os.path.join(destination, "screenshots"),
        embed_screenshots,
        output,
    )
    os.makedirs(options.extensions_dir, exist_ok=True)
    os.makedirs(options.user_dir, exist_ok=True)
    os.makedirs(options.workspace_folder, exist_ok=True)
    os.makedirs(options.temp_folder, exist_ok=True)
    os.makedirs(options.screenshots_dir, exist_ok=True)
    return options


def setup_environment(dirs):
    os.environ["PATH"] += os.pathsep + dirs.executable_dir
    print(os.environ["PATH"])


def uninstall_extension(options):
    shutil.rmtree(options.extensions_dir, ignore_errors=True)


def install_extension(options):
    uninstall_extension(options)
    env = {"ELECTRON_RUN_AS_NODE": "1"}
    command = [
        utils.get_binary_location(options.executable_dir),
        utils.get_cli_location(options.executable_dir),
        f"--user-data-dir={options.user_dir}",
        f"--extensions-dir={options.extensions_dir}",
        f"--install-extension={options.extension_path}",
    ]
    print(options)
    tools.run_command(command, progress_message="Installing Python Extension", env=env)

    bootstrap_extension = bootstrap.main.get_extension_path()
    command = [
        utils.get_binary_location(options.executable_dir),
        utils.get_cli_location(options.executable_dir),
        f"--user-data-dir={options.user_dir}",
        f"--extensions-dir={options.extensions_dir}",
        f"--install-extension={bootstrap_extension}",
    ]
    tools.run_command(
        command, progress_message="Installing Smoke Test Extension", env=env
    )


def launch_extension(options):
    chrome_options = webdriver.ChromeOptions()
    # Remember to remove the leading `--`.
    # Chromedriver will add `--` for ALL arguments.
    # I.e. arguments without a leading `--` are not supported.
    for arg in [
        f"user-data-dir={options.user_dir}",
        f"extensions-dir={options.extensions_dir}",
        f"folder-uri=file:{options.workspace_folder}",
        "skip-getting-started",
        "skip-release-notes",
        "sticky-quickopen",
        "disable-telemetry",
        "disable-updates",
        "disable-crash-reporter",
    ]:
        chrome_options.add_argument(arg)

    chrome_options.binary_location = utils.get_binary_location(options.executable_dir)
    driver = webdriver.Chrome(options=chrome_options)
    return driver


def exit(context):
    try:
        quick_open.select_command(context, "Close Window")
    except Exception:
        pass


def reload(self):
    raise NotImplementedError()


def capture_screen(context):
    if context.options.output != "file":
        return

    if context.options.embed_screenshots:
        screenshot = context.driver.get_screenshot_as_base64()
        report.PrettyCucumberJSONFormatter.instance.attach_image(screenshot)
    else:
        filename = tempfile.NamedTemporaryFile(prefix="screen_capture_")
        filename = f"{os.path.basename(filename.name)}.png"
        filename = os.path.join(context.options.screenshots_dir, filename)
        context.driver.save_screenshot(filename)
        html = f'<a href="{filename}" target="_blank">Screen Shot</a>'
        html = base64.b64encode(html.encode("utf-8")).decode("utf-8")

        report.PrettyCucumberJSONFormatter.instance.attach_html(html)


def capture_exception(context, info=None):
    if info is None or info.exc_traceback is None or info.exception is None:
        return

    formatted_ex = traceback.format_exception(
        type(info.exception), info.exception, info.exc_traceback
    )
    html = f"<h>Error</h><p>{formatted_ex}</p>"
    html = base64.b64encode(html.encode("utf-8")).decode("utf-8")

    report.PrettyCucumberJSONFormatter.instance.attach_html(html)
