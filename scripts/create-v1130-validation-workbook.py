import os,sys
from pathlib import Path
from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('LONGEDIT_R5I_DISPOSABLE')=='1' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted'
owner=Path(sys.argv[1]).resolve();target=Path(sys.argv[2]).resolve()
owner.relative_to(Path('C:/LongEditR5ILibrary').resolve());target.relative_to(owner)
assert target.suffix=='.xlsx' and not target.exists()
book=Workbook();sheet=book.active;sheet.title='任务';sheet['A1']='待处理';sheet['B1']='00123'
rule=DataValidation(type='list',formula1='"待处理,已完成"',allow_blank=True);rule.showErrorMessage=True;rule.error='请选择允许的状态';sheet.add_data_validation(rule);rule.add('A1')
book.create_sheet('保留')['A1']='其他工作表保持'
book.save(target)
