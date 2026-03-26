import type { ReportData, ReportType } from './types'

const REPORT_TITLES: Record<ReportType, string> = {
  daily: 'Reporte Diario de Marketing',
  weekly: 'Reporte Semanal de Marketing',
  monthly: 'Reporte Mensual de Marketing',
}

// Logo Diego Ferreyra (300px wide, base64 PNG)
const LOGO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAASwAAABBCAYAAABrYJlFAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAABLKADAAQAAAABAAAAQQAAAABynuK+AAABZGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNi4wLjAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iPgogICAgICAgICA8eG1wOkNyZWF0b3JUb29sPkFkb2JlIEltYWdlUmVhZHk8L3htcDpDcmVhdG9yVG9vbD4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CgQ+9BsAADrzSURBVHgB7Z0HnBXV9fjvzLy+b3fpRZCqgiJNLDGmYFQEFZQYTKJoLBGNxhRN/P3y+yWKqf7UGEuMYImKJRqMBaSIJRgLsQCCLh0W6UhZ2PrazPy/Z96bt++9fduA5B8/zv3s25m55dxzzz3n3HPPvXNHKS94FPAo4FHAo4BHAY8CHgU8CngU8CjgUcCjgEcBjwIeBTwKeBTwKOBRwKOARwGPAh4FPAp4FPAo4FHAo4BHAY8CHgU8CngU8CjgUcCjwMFQQDuYwoVluw6ZFC3xl/gK44s91zboZjRuJTdu7JdQaqpVLE9BnNZ7+CWHBXzKcONtK6WZKVW96aOnqty4HiMndQ0rf0TTfbYb19pV4NQmknt2VcysbTnvVH3AqIrSWNwoCxmBcEol/ZJft5SpDDuWjAVqtpaEqtXiB5Itw2k+9bBRUyJ6KtbR59NLlZkI2ZauK023bZVMGLpWa9RoVevWPVndPIS2pNha6Wn3dbIDEb0tuXPz1DZoSbXwsn1O3Ml3hqMdOkRz09tyX6tq42reD9JtGDI1EO3Tp7z1cpTSfSmlG3E1e0qDUlpz/aupMx/qGNX1LJ80B1tL1Fs1sXBC+Tc3qIVTU83lU6Pvi0bD4XCz6c0k1PqSdWr2VfWlpz3W2Q6YTWhNi6qhQ7yZ4kpN+qsRra3t1DSdkvP27nHkZvQfOkTD5Q4fNs3XGKM1JO2acDyhPg02qMVXHTB/AlEDryZtcWqauYI+aZMsNyLWzrs2KZe2wiwNRM5UhtZHWc33vQurLJqKWSX63v4dK7db2sW74nZs946lQ9Kd4GbKufbrd2lQM6wf2UrrqFz1ZkSUT0+8Tran3KwlVviblt83wjZNN6r1K3BKAvHHdyn1RvHMU/Vew9aiLNf1t8zwcaGgPti27d6GHSxFbnTaXIfm3xGIqLUDzPplieMmr/bt3bJl48aFseLwmsZ2GTShNBLq2CdgNRxn6sYJyrIHKy3QTfNZAXgkpezgXkqts8qtJX2HXfbPVML8ZOuqGdDrAMKYOyKWXnYlOIeVbTYn+E0BG4ZWGklsrlHqIUks61I63LJ845QZbweMoFaW8q1GWzl9FhzYtY9KqotbxMO2NaWVWKUWdDbNHclz/rxexaZvbUht39ZE0Yya7ivRUpcqFShvFWYwEisPmXtSdq/K1NiHN8Ut/xa14JK6woZHAv7RSved0N52RuPmG7VTpy5Ui+q/rvRwb2UmG+lkBLVowvc6I2QzPKdUdO/eQSoYnEQ5Bq2Mgja4SQWr1KSy6WqmaigNlZxn63r/PNiFDYB+domeKDMjVanu1ib9zAcqa+N1W9XCH6cHnsL8LTwHz5h2hK+mvo9STVlbO6tHsta+590WlXALsNuSdEgVlqVZ1xi28TWUSqt12ygdTVMxW1l7DFtfGVHRN/uM2vB6wpq0esfSmeiO/BAM7vUnrPKLdcPobuvpfpdaTEthoTUqLMaxcYbSzrL11nFwa5CctmV8wOUNN869dh92cUlQXzvCp/u/Da7naLrqK2kayBcO8hp2kK3pewNKe8Ps1Ofxwzp/+81ti/+y24XV3PWwYy87PBI0z7RsdbFp6ydRRxDgICXtFOwITpu1r9qWfbnhsz7GgHym/7DJz1Yuj69TamY7tDOCYAQjIHqj0lVHhb5tezCUZabeI7+jsMx46mQ9ELwJgWk7CJqDQp5NAUdh+Uz/QKXrN6Xb2jIYG0MWiiR8pr1Fhfyvl6R6PF03+r531cJrGy3jztUo+LIfA7N3azDpT2WaNqyi7Q5o2vsBPTbTPOPeBfWvXLctFxNdt8+hu69qTzs1OtE2rN+oqVP/bo2d1p86bqR81uoT/WP7fF9Q46e/L1ZYbn3O/eipPuVXV2u6cZ3g6QZN89F15mOqY4ljFZB2OczxZdrrZil+hXCWxkRAqSpbN5aXRUqeT4x5cFZswZWVxQsUicXi89VW/a+u2eMAVpBBnvX6kpQ+EY3/YUHiIXtspZXtq4c+QOYs+ITOaOXnQLZVSNf0XkrXTmdedYvP1h6N2OFre4+48EjS8yji8wVFD8ZsG6a1Mj/uNWXnmbcQM5GXx83b0lUEgaG7sLVdBl1eGjHU1w398CAVXcsw31eEIFu/RVudn4uPaGHVCW02EcI+GLb83xs47OJuhXBzn6WtwYD1c9PW7qXcV9BSwSx8tLrt/jL1OHTR1FBN6b/WDN+dR4wMn6jU6HYNPFqalgm0D1wM37f1Z6eYnWIPZYKm6zS8nTDgD82SQplgQdC21g8NIEgAe2EAmuu7uu57sCQc+LoaPTXkgstck22DKWgATamu6G0GOfUn3Rf6aclpd3UvgIeF2952ij5BQ1BBwK9Ns1OJSuEdFy87JTNB/aslDdqXC+pyHku1wwcqzTfJNsmXpQ/8YCZ3BpR+p3ogO61LKvqlMU8L945MMkPRta9atv57n1//VXDc9IHF6i8WV75/Zx/d1s+iw7oxMBf8tG7g20/zW+cUqHVpREFXkUYwXmzd17bvg7D1NM8g7vGpz0/jCGOAobSNTKwRN75G2FNw8QFfWXFw78xDKN+rmXI3/pbUAE2hqLwX38DsyL7e02zZXg/gTtmkt6qnF31q34KpWlL7DVFUovN8waGUHoixcUQy2b3n2udjNzKkJ68zp03XbGg8D9sxaeU5e6UtrP2Du2zUz5z3JYnCaxEkfKF7G531L2z6ChksD07nEgrTt7eyYfRTcF/lVwxt7Z2dOzWgCpzBC2mzWsOnwr8DMAMzPY1r2PF5i2EB7jkhPdWVzrpqE833GoXK+/8corH4jLhzBHP7CXOYUZcOrZjsDevSTnYESnz/WfoUlnMrMYk/lksf+kk/e4k/Jbh33ajuq1uPZ6sRE0skklhKK6QsDj/3W4es/fjorcAj34zgxXzAY+HND0lBHsfOH3b+5CqUxB216j1nkZY0xYKkZ5Rg15xF3R258sfvSYHg0JQbkO0+FVmqxrCIWK9NaHHub4Ef7TYyQ39kpNnHnBqYqkTIz0axPx80rpVhZMnTfU/vmfvcTN/pArrplPmixlZopxi1Y2ExnMjLCDhH8OpW19UdNVwtPLaB8MzVhGTAtfJfNWE+C4i3I8MCs70hQ1vSGQNKcgZWwqdXRQqqAMTH0aqJ29SM75/20VbI0g5Wqj29fHg31epZBmk2eObzCCoJuWQuiIfVWu4GLFcSqIuT6HfX+gLae7BjILhLsxjVN89n6+VdlB2k3Ke/asafNPECmkukg/GGlFnUur1u+JS9j40P9y1N2lI574EXoeYNDX2YW8PWJ5YFeQ3C+iy/roIOo8v/fQes//JITdd3/c9iAzWe5ypsR2bbfXjP+sL3l1VsYKQ4wOI7WtpWV/VQoq9eFKRuDWGGqjxX0T8l9L3DD4hmb1r3/WMW6ZY2/hJXcxpaIUymds3rIk924iY4R8A2UzR4UXrYKrAa4VL+8z4iLTslGFrnpe9zFRyMxHLPD8n42OPCT/J+bjTqAG3CK7cffUP3yd/cW/to10luCykEEoYum/hFI6lggaiF7fBqB2ez3V8bYSMnK4Y2RLd/Joga7JNbVzZsiCms6sFF0LorOYHRU0m+f2zKUpqlGsCyXWZtmaC2GM7h4W2JenrKSMuDLCyLzthU7xaE1mNIuW9tZO3/K0yiYuznlg6lppq2OUtS7I0gX8ipTiz7Jki2BzhRLb1NwykN4Zf5ly8zrW7Aa2O9ua8+gEtFPgocssuhlpmFNbBXtNmb41ysstBD+AL03+5tyf70GX9K5/8jJw/uOvOQyvAs344s9lwa6XER7xTLixUpNPckRHTnDTxtblpvNwSE3ouV7yzSeB5+qPIViceqVrV/B6Q1X9z5u8hGqyQkJk4wBwy85SvcZ1/E6zkWUT9NW2sGqHU9ZR2U0HltP+hwmh42IiKK2taPZL3lz3+MumSj7xuQFbDJoavRoH/vUuvYfMfkMHNE/J+dXcplc8ETZLA76daZzBxFyG3wQYLAO3Dn9AUOBHH7xi1h24m4Ig98rQyuEjuHjCN30/VgO1mtzBUiO5DXNxJMQ631npiQREJN/EZ6/Hx1zf5Fpv6Q3DULyQM32g+NLwPLaFf5MB4nGSoQXko1+1caENt7JwgIhFArN5fwlXvHKGett24ezfXL54b2/3BI0zYx9BeuW1+ZoopDONis5+ujllspIWreY/yNI83Z2kJH+stV5ZWfe2am1sm1Jzxm62pL9APJwiFGvk9Ye5o+FL6PlTs/gl9NVyO4Ak/TDgB2Jf6hfYadh5UCr1BxNj7xxALUWFgn3GXnRMYWRjc/ohVR8e/bk0k72Mq3aZqlXv7zRn+ZMEHsyWv/Eb6kRA0f2fd+yL97O9KSBU4b8vEh/GEPQKSg1XjGy6Jw0E4pNTTteLQkHZTnfCRUVMxP9hl38J954+Arw+jVO7ehcSzvD4OgO3TDfq1Ph9X1HXVLDulXIVKl+TNtGkeFEftl+c5SV0hBs+95V7x3ggX4uYofiSoNTWrBneMx9zUALK18i2VCz8KrdzWTIi+4ajyzcHUo8hwB813GSO6lYRbpvfDRszcZ8eCavQCsPctZVdMwD97DmOFSZGgqPfhL9qvmOwsK9jo2zP+RE1Vac0A4v+KrCPXvRzqY+LAeHsGowAvvVvMkopBYCy8zFUtlJUjS+WN7m4mTrQem4h+6ihV+CYOmTH9IKqHtKs24oPe2PH9a89v2mvkY5i0vzydsefmfPKAqLd2VflCmfUlc1V50TvxHalZw1HUvWHiNEFflhk/SRtl0mMwfZGnNQIcv4BwWlhcJYSSa+8t6s8dwIZzg5WfSV3kBL2H5Rv65wu2DEhIclPuDF0Ns3fPAA5uWBB1EGGG69/bp/arNQDA55svUHSXeUysaFj8b6H3fJ3Ww5Gc4cfJT4sJwArmDbA707mVnmmbx0/Cm2ewPjl+w96e780hmd/5SVdqxEMd9WsSj/dZt+nQYu3lS9/h72xfyC9nZsVFpShzUcWMN4MZzTGuSQQ6GVYv6BihMMMiFtELH6aFszQiW+g2YGF+6BX7F9OK+KRYgbfFqgpigcP32rqaWkNafR8oo5AnDGA/cB+HTo2S/tG4ESml0G3X4cPn36ogZ8T3mFWnkIhYw5sYS8XJ7Z6Ojkd5TWN0pDyTkgPqtlEPSaUh3h45t4ny5ZNC/tLI3XvQSsF4qm/5siaw433yv9xH6KFbvrXfkTGjKtPtX2+b8FGk36Iejv2x8Tb3T6TQzRm1aLzvbCpnAcwKscYrEOvh/s1MULicD6JjOlOQc7W4Lu/9pAc3kVimVWm9HMVs4Ppsa/01RZiaJK+460d9DQt1R+8Nj7hwI7FE8n1usnNfdDOUzC0qOTGkPlkhkf4Z38NaKxVPBqnC2lFQa6S456GcLT8fyGIard06V5Qh2ny6gK2vnb44+obzJVW4j/IhUxH4UZ/kS5T522w0ZOcJQ4WNt2B25ZJWOTouydl9ExEyQ/ddZR/qmA3/7D6rf/XFxBuAX+HVeHNDKq2hegdK8o+rPsK0Dl9PagU3fKtuXsg3sY8sj8JF0Ufzyr98cbfuDJe3DtCGJ5MGu6Bzx3MvynSwrNOXwRZfrjkrPuE5o3H8jLXyn9c0nRNtJ2zuG5gq0DI5sH8m9KkYP+DB2/nckeqQyZnLayAmvo10ZPvw+faH7w+ZNnYdF2kUY6UztWFMXZnp+r+afaBd/7lOXBv6VlGSo7Fqz+tdBb3fo1X6ptKf9yhSVoIL603OHmAqxEsF3hRkUptY2cTzF63nLJhAE4kJssn2a4VS7uz+XgNGhoXCQPUVJ9Mz/plyLB7tfhiJcQkakgOYf6qtNKyFWqFJKCokQyisRtC/WwqVN/2bJTv4zEG/46k53pReCrTW89VWXYvrsRktupYzGkkHOwHJqk2yelXKSJydCKG/S/Jkf53Kcs47er33u8shj8/9g4VHG7cMOHGbDMx3gNaUlW6AQAxxIo5b8svH/XSe2CR+aavtY/2SH/VNo3lmEZ5wQF4xRlGt8Rv2t7YebnlyY2DjD5aYfwKcvvuTDTPiw3pmbulLUsId8P32ANZtrqzBr0wbyu8f2890cn/TXMZtbzIS4ZJS9OCk4QadnZ7tbUeDWVOZOiVQ59RT40o4fP8I9rzHFgdwfZKfmVwoYYKq4SksY6gkUdskm5MV7uJY3/nHah7eG3DPo8jXr6Nedg/7Jy8WMLphY42tOnNWhx8skemewPKHkmefo5P09u/ubuwanJErlYQZVLH5uFj2Mqo+kd7DyeTxs3okPqgQPa6TZxL82JgdsWNlm9xtOdvAt3S+WEI54Vf5WT3sw/eYeyNGndT+dOJcsDKLp3ue7GvmJJPw0/Qy/cVGofimo5ivJx0qfqtu+ODR8+urYZ0C1H5y5wtJyzlVTpy0MdmsLcu+DazYal3YMYYVVm0h1B0A43DN/1HUY/0qERi3yBzeZvzAClsTx0bRpKhSl7RgxEx2gKf6RvSmR8zxG52YvCyM/wn/zERF2X1Tuc4TnGqCz82f5vlgUTp7nIl9ZUjdJ8obRlKKuztrXRtJKtOtvd8u61rqzTSqaDC3HvQjrqxL+BI+zCdi2UuMByrmB06AL9/hpKZwcLZM4IKsYCpvFyg7Nz8PUwmgmjYT+xPkoCx6tyIL6ytxqaUWnpxsq+0T7rRUkUw8g0Y0nbF3oIGe4oh/g6gY2TrKO+k5uf96VexGG/Tg77bXMADj6sj5rLv2Hp4x8MGXLNqniw/hX2dA3GA9CPrQvdyM9Jo9IRZhwQuznQrJL2rmZbz/J1i2fudzw1zQHNiV++/HGEUL3Ud9TkxT4c+nxI4yh8lX3ZctQRcgXQjNDErua8+s0w0Fp8Z8vXffDY+hwQ7boN1aRisZDvSdi1zLESKS32LUNpu/bK0HcVlHuYa7vqZ8QWH5YTKL8FjnjYxSMdiY/IVtszWbIXPVw3245Fj+Hdt5zjUdDrfPwgHq6RFcN9ytgErYY8A8z0lIZIaRvw8vhEgIrlUXLmtNuVz49VlWkD52zh71F+kxNkM0HK0kbON2p7O9P0tFre6wR8LWDssFIF7acexpONbv0tXXGMz8GXtkHGz3SAGrpaUVimbtaVOyNjH7wdCx6+yeQVjzr7tE3lHIPiCCeWWEflN16W9zV5jZdPfiTer3/l+/TFdYUgW37mMEI2xj5s6LwQJfWIPGoqXlKWLIHZW3wLoCXAh1RhGX7rMY5FjGBnOUHIwpfk6uojDXsDZvgWFxE9xU5Enz8e9ul1oYRR4252rHQzFLliqSQHnXL5/WaqhJd3WOUmWKkw3qmEWFvZ0EkreQ47dLYeqsv0Sjap2RuBU5asamF/iVIVFX8SIv9TfsM4kbQ66CvlUIYQ35vTQkl/3AzGayvffVL8SG2utxChTxY7RxxvHz166is76jeUx5P+KGsWgUDATKV87F4u77A/c+5WYdF2Pe8afU195O0/3xHiJc3sFMvyK18yUSOmY1tDpNR816z1r3b0aVsLUU8yomdp3aUhuKE6nJqaxUPgQMFORnyXEDM37Hvhx/tKx0//fTBVElK8reUE8vJitl4S75DuwLn3JNTZj94VtKGY67OhTo7nKyYkdnlAeyaWYgU3920FjptJJAIxt249HJirx/3/aG87UXvVrdGzW7J+814VLmi/bNTtuKe1soIfuz9mBG1/MIsbrmFWYfJkwm1H/9LyV7fX7l+epYsk4AuMWXxMxGFbTQUC9pKYmdooq3t+lFaSjdtomgPi6VI7vLDWrN/k1o92VtFYuFZGZy94FPAo4FHAo4BHAY8CHgU8CngU8CjgUcCjgEcBjwIeBTwKeBTwKOBRwKOARwGPAv+fKZDZ0NI+LGSVbB+rVzqfNGtfSS+3RwGPAh4F8ilg8UWVAZ2PqmluS1Nu7gPa1lDN56oNzV/OJo1cWN69RwGPAh4F2k0BwxfiHbYK9ocV3XqSB++AFFbCiNcG2WXIG/OehZVHTu/Bo4BHgfZTIKXKt9Qmd7W/oFfCo4BHAY8CHgU8CngU8CjgUcCjgEcBjwIeBTwKeBTwKOBRwKOARwGPAh4FPAp4FPAo8B9KgUmTJoXll4Oeu/fNveYk/XtvwcsYP358l4JaW8PLSR83blyZlC8o6z0eBAU4A04O5mqN/gdRw2e/6AFta/jsN5vTfa67Lrhx48ZhfFnkY04EzR53Im0TIeZr9b1feOGFD9vb1gkTJhwm3996etasbVI2Ho/fwiftP+b28XPPPfcXnBXzAPdGIha7YuSoUb+FSYue/yVlDzRM5bi0ZRMnnsTBf3K0Msd1mbuHjhy52K1LFE0sFjsOHMbpui7nRL0q+c4777wRfOjhtBdmzfq9PBcG2na93+9/lfZsTaVS05PJ5H+RR/bP/FsDdBxKhcfQPs4z1D58/vnn1wgCtCsAXqPKy8uXPvroo87xMKJYofnRL774ohy37RwBOnHixKP4qMIwDmX08dGwCtKyZ6Gdd845J0bKytY+9dRTnFLkwOyUSCRO4PyzLsowtvt8vkUuv8AnfXg+Bvoals63gixr7axZs9ZJOTdAs+66afYeccIJSwsPpXTzZHCcvHTp0v70AR9+MN8LhELPyEm11BHhexRf55CrgXzyZ7/m8z1Fez+VstDhcNrwLWgg54Pt032+6aTtkTTa2M1OpS7kEMieNFpOqnkQ3ByelPTPasgctfhZRf/A8UZZ9ffp+kMolONyocgox5eZp8I0P8yNb8f99+st61Q3P4IhX1P+GMbtBsNNRMhjDQ0Nw0k/hbo4h6jNoc0jb8WkSR04Qes3ZjI5CgEeZtr295YuXvxf0zanttpaUWSncCzZuwhZo1JOJr9M3qKfuhIFz6lyF6Do/KmuXRt8ti2nUDrC0eYWHGRGaFjK72aE9IecsjycD4KeAv73njt+/IUCur6+vjdtvnnbtm1Zy8+v66M4m//HJNui0Ch/PTT575RtH8cmwhNo023njR9/ndBmzJgxJSiwqVVVVY6iR3mchlK/A2VwJh01BJpehfL6EzC6S30Mat/hC0kXc2bUUHD6AjjdjaI4WdIyQc7W/YVlGNMrKipyTkR1kx2FaAR8vv+BT/gwrv0aSmYRCuaH0Hn4lClTQF+/hdwj4Z0NKJ8RtFkGCWdQJf/N8FYdv7+juY+lXVdKmtCJNt/Eh4nlNL+F4NCLNvxI0j7r4XNrYdFxg3XDGAYTnsp99iMRS99//wzd77+I+Kelc2HyKEwro9hgGCTGKDYHIRnJqD0DpurE6DcWBpNvGHYjfTPMMYkTQY9BCPz+UOhZyvbDipuPYhyOgJgvvvBC9YRzzhkODBntbBGSSCQyibKD0CYGAvDqC7NnyxHR+pIPPrgChttM2skh235AhcO7gPcN4oaS10fef44YNep58jqWg+ArAcHt7zOMLinTfAIGt4LB4DEI5q0Izd0w84XU/Xfin0fgdhmWdTSj+JjZs2c/hZVwLEK3F0G9lOsQQMVp72N/+9vf1qLgu1NnGbhWxrZvH8zh89bsF17YD30MhHgiaSPBMwQi71MfxsFMk7TyVDx+AUpgIPBEeBZgtb7mINnOf1P5NuNS276JYgGE8754Mlkdks8SKTUW+JdQ1yz6YxDP0QULFjQevmcYx4GTbHC2Sf8x/XM0fXe/WV+/O2UY6AP9JOBNgTbPgXeANvQj7y5ocCI0+gn3nHKrfcx9Enp1QvD5PL1+JvEzUApfBPDfSHsFZeEL+P2jGJC+TNoifqI4vsxxm8Ops5z+H0BU+uRJScyEurq6rn6f70wGjwtqa2o2l5WVyZekbsReK9m6desg+GsgiudG07L2UH+S+q+TosR/i0F1a0My+Sz9GY+GQntQnD0yYCeAVzIeiz0NvHpwEx5q4TN3mVKfgcvnVmHRgcPpyKUwwAkidCJgmOZdEapLYLKdMPFHxAdQEL/h3g8D/B0mKU0lkz8TM5u+FUY+nrQbGP0eZgT+2EgmEyoYDBO3AGWxPllf3w+ROA/Yd8K8Q8m/kXLIl3Ys9bznwE8kxJozYdK3GYm7U88vzj///B3vvPPOehSdjIqvoAxW1tt2vR6L3YSAdUZKFwCkhHquXbJkiZxpP4tfNgB/CG34ZM6cORskEoV0MkJTzS0fg7UvTer663NfeukTSQOvs0SguH2K35HgZVvJZAXCsQgrZIwWj9+BdXVBZWXlAASnmrbsYyoyNv3tRY62jMdvoNxA2v8yeHEErP2jeF3dPtr2Rryh4XbwrdKTyXfsQKC7lUrdTH37mZp8QJlsIG8vhC7oRlCmhnryNj5/GI1+CcXzBfrs0nnz5q1385599tm7aO/7HTt2jO/YsWModJQpGeikQ8ZiXIwCGoiCmUjffQ8FvIxUwCnFgLGtpKRk/a5du/Yj3F8lahfwa7HarqctHImtzQNf9/DPDWedddZPmHfWy1SNvL2YEq7lVwtePaC5H7o5xyJneOcH8MxDtO186DWM/Hnt5llRtg6c92BKfbFTaekK/AOjsPAXc/0Yxcps0pzqTjNlKkwfLKUYqNmn0VfvR0Kh62h/V/KtYTB5WGCSNpbfxnAwKBah0H0zecUV8ZkPn1uFRScPhcGeYbQ8m5G3Dz1ZCfN8DwZdRY/3gzDLiR+HshBL41p+2+rjcX8oEBjBfXcEKjn+nHNOgLlWMDf4Cz6OfXYwKCP8PqO29hk9EmkgbjzPMtqLcBzLvxVcJfSn/mnAP437L/D7KYK0k+nMajj+cpTAF1FW9eARNXy+RxCGrQjCSTx/lfsp++vqNoOrEQ6Hh8C5F1A+T2GB82Dw6oFy+Cn3EZj3aBj2t8DtgUIsRUFx7G06cD+M0Xuh49OrrOxL3lt5nl1dV9eAL2gVQj53/fr1PajvaKYtGyllIXwjwPd1hHYI9+cFdP1qvbp6QxU4RYJBEyncTV3fJk/PpGnemkyldprxeAiB+hr1nQOMrOCOxnIi7+W0owe05zsffNrFtheSZya/bDA1bQJJi3OVlSSilKu4yNHV9oSzzx5KX3wo8ZnAF+rtgUj94yiuM6DBZoQ/q6wkD9aYnNgr5UWxy6CyGrp15XEotLoRy9NVVpJFzZ07V/xdOnn7ki6KQqzvBhTTsSimd5juO9aV8A5tjdTU17+AUjkGRSN80ySQLxwM8A1HnQ/wKjWIPj4dmt5Hu/ZlMjtWGThNYGAchb/seuruDC+NZLB9n3KvQrMyrr8AlgyC7+FzGAU+W8nzOvCCmmH8L/0qvPdCEwQ+YxGfS4Ulox/mcl8E6lY6dDiWwXHwQwcYbCjMfQtTo28wZVirIpHLEaK3YPLVbr/CLHLUuHQ+71LqxyAIc2e/+OJmSWcaOIChfefzr73m+HYyArBS0giDqGeaOFhhzPK62to1jOy/QKGINjtdMuDQToFDpc+yNqAohoHfGpyoIiDWhPHjz+T5QxjZhaewAvYTd6SUzQtM58DrTZh0nY8D4VUyOdv49NOVsS5dzoK5d7w4a5Zzvjl0EOd7XyyaDz/55JPDEbwEium5l156ycEf62U7FiIyaSZQmMeSTxYPZH7VF6FaQv4zoMHmv82aJTgS7Qj9rNCuXXa8c+dfICivzJk9e4PEE+qgRwM4ZS0piVy4cKGJ1fIMbQ9qST4A4ffLQsVuScsN1NWP5+zUPSdNox1+ntGJ8f4I9BNuGvFliXi8s6nrq6h3HApXFDXkzg9TKT915swEfTGU8v+kzR2Z8vr69euXVexuCeEdGax4HoyS3Qx1pid4gD6j6LtvlScSd5AnTL0/hLdeRkmL8tvH/SgXRs5Vxwr6KQi9r6dSs0ymfNBzFzx3Lnlm8BOaaphWl4D72QnL+n1JNLqaaedQrKZ9KMEnGNh2bNmyxejaufO18EL//fv3rwGmCYxHyLeR8nzJy5hMX8hg+pkPIi+fv9DQ0BXmigRRSjDd2zDMeVyvYcR6JIlfhM42g5067SZPVxgtSyMYsSuCMxaCLXEc2Lbdm3sZsZ2AxTYCOKLMnED5o7lZLkxOfHemcR+HDKM/cfFOwAd2T+p6G6vpr3ydZCYj9CLilpBvEYw7ijRRTo6AASuK0DlKQYADs5wHwWW+PLvh0ksvDTHaCl7PoWheq62tfe652bOXzly0qIGG9EfRiMXgwEHAhxHXFWFbRdwg2tYJhcVsJB2InwQ+G3YTpC1YS8uZWnXA6mnJBS/Bri8lf+R3C26t12GM44+Xb6REEaosLJRVH2AcZ9j2qy78zNXGalkjK3UvYr3I9eWXX95ekAc07DXg/lXajd5PB+57oLTvQukOHzKEb9radmc+XuooY8mBL28MNN1bXV3Nh2q19fxOEJ9hprhDQwaq25bU1X3NidO0fii3Cpw+e+jL0KZNm/KUDHkvoq7/pl4xBIfSP8temDv3Q/BfxvP7KIy+qmtXUZzn0989GDR6gvdl0ERo25tyUbduufIcgU5nQPNZz8+Z87EMjPTZp7RTnP42DvzO0O1n0HFE0rJuY4B7A2Up9Dbgj2qsv008J7p37x4Efkd+K5lG+mGYevxx67BG49FoVD502Qs8nMFG6v0sh8+lhdUgUyaUxsxXX60+f/z4hUjVL+nEP6MoFjK6fhMm3yWMAYPKVOuHCOl2mKEOn8wQHPX9YMRlhO4wQhlCWJllAF2PwMmDzz3nnImBcFgc7UdoqdRyRrrDMZ/goeCmeH39t8n/qcCHGecyol8R9PlWUneSUXQsdb8566WXaqj7OGA/58KGCfl8mboFXKbAfPsZwU+D2VfX1dc/7+aRK76Yw1A0ZfjaVsOw4rfKhowCvAYY3wOG+E7GE1eHFVcl9dGeenx2P2dEXwp9+mPlfRnpuLVXr14hgPRiNP84UV8/WPP7k+Avvqy/o7TOQ7CuBu8qBO0M4G289957U8B7FvgXUleNIED6OGj4Un1DgzP9yiLVxhusuxkAuY923w3dlqK1Srk/HrqIcquUhQfq5Ivh6gbqPJK6OuEbPJW+ugMrLoUyfQkr7hwU7b3kW0R6AP/OKBRLgr6pEGWLkuoG7TbQzr0opodpz68mTpgwB1/efuo/kvYcxXR5uvQdfTySuoLQ4JvQKgg9v0Z//AULp5TyV2P9/C+KfQXx8j2eMLifKtYsuFa4TWYwSbI4UoOSugCcyn1MoXG+TwbuA6Lgof+9wD4SJTwPH9eJ9M3xKLmnUcCVOPgT1H0T7dhEvpPpuzfp+4ouXbpQXO1krPgldFhLmZHUvwZ+eNOt97N8hR6fvxDQtCo6eBott/VQaAMd+nt+D4u/wk4mt8BkfxaqsIIjCuOPKJVeMEAnLJf5MMcdOF1W8qwxHZiGEspOX1jqn4FC+wd7ZdxR/EmmFmtwxJsIw/0wegNMvxmhduAjMKJsHkQp9OPaB+GaxerXS9yL72Wun2kd900I1dQsBMZtCH5PhHUgXPkPEm59LTP9zGQTJ24SX8c0RlbH9+HGyxWL4y3afRvC0xM4YeA9j8DeSxLNMmXadCNC+jFCcBS4JBDU3xD/FsJqoJgeXrZs2VZfKFQr8KWM+Gtoy69QDN2xnAaA0+vAmEEasxvjr9T1CPUMwELoTdzzCOwfMz4jHtsXsBxW00c3Ylmso429oJkPWouf6176zekD6roVpfEW7esHHhZt+AODhmPRoby3inVEe5fg3+lJHrFY5yVSqdux6rZAL0Xag/v27dshCgkaTAfWQ9RTIvmh+Tro9WumeEJ3GEd/Xfxl0h8omXLo8FIskZgGnuX03bNc54vFBG6ruH4IvHupT2aP2QBOCZ/f/3OEMMhvAsrwGKkTnIQHDAY/2eLwGPer4TdUn5akPRYWaBV0uBl86/h1ocwbWix29yKsaOFhaH8L/tA94NaVqeAHlL+1cPDKIvEZu6EfPn/hiEGD9tOZq9euXRtbsWJFasjhh694cf78rVDCHnT00btgjnWEOCtjDQMGDFhj+P0yNRNLaQ1C8vGL8+btgcEbomVlq7COxGnrhO6HHSYrVqtgqnUwTg1lVzNd2Nu/f/+GQCy2ahXwMvDXC3yc2Q2DBg9erycSa9A0yyj3EQLtKJojBw3asHnbtu0EeBan2caNiUGDBlVyuwYn9kesQi7Dn9XExzJs2LAYaXl4Ocjxb8OGDXFpD0KyijZWIHwfxROJVUIHplTboMkqnPzryLoK4V5KG1chzMkePXqkYPxV7733XjWrcTWhcNgpA/7Jo446agP1rUVoP4I2y2j3Lqlv1apVDeC7DmW3BsW1DGFdBi3EQX5AgX6y16xZsx1arkeJrkAol+3cuXPVW2+9FXMrBN9P+/brJ4qHrz1rHwq9EX6Hht26dUsEgsGV0N+xSlevXl0H/hv8qdTqFB+ujcXjgn8leIj/SvXu3fsTLLbltGsFbVwBvT6WvqNMDKt3BX7APOv2qEGD1oD3LvodHdgYmOZtC0ciq1BAH6F4lpIifsragQMHNkBXgb2EAXK1EQqtZIBbTdp+8tg9e/bcTjvXSx5osXzW3LkO3QXy0KFDP0X5rfclkytqYrGP5s+fv0PiveBRwKOARwGPAh4FPAp4FPAo4FHAo4BHAY8CHgU8CngU8CjgUcCjgEcBjwIeBTwKeBTwKOBRwKOARwGPAh4FPAp4FPAo4FHAo4BHAY8CHgX+H9rFQiFAjre9AAAAAElFTkSuQmCC'

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function tokenWarningHtml(expiresAt: number | null | undefined): string {
  if (!expiresAt) return ''

  const now = Math.floor(Date.now() / 1000)
  const daysLeft = Math.floor((expiresAt - now) / 86400)

  if (daysLeft > 7) return ''

  const color = daysLeft <= 3 ? '#dc2626' : '#f59e0b'
  return `
    <div style="background-color: ${color}15; border: 1px solid ${color}; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
      <strong style="color: ${color};">Atenci&oacute;n:</strong>
      <span style="color: #374151;"> El token de Meta Ads expira en <strong>${daysLeft} d&iacute;a${daysLeft !== 1 ? 's' : ''}</strong>. Renovarlo para evitar interrupciones en los reportes.</span>
    </div>
  `
}

function kpiCard(label: string, value: string, bgColor: string, textColor: string): string {
  return `
    <td style="padding: 0 6px;">
      <div style="background-color: ${bgColor}; border-radius: 10px; padding: 18px 16px; text-align: center;">
        <p style="color: #6b7280; font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">${label}</p>
        <p style="color: ${textColor}; font-size: 26px; font-weight: 700; margin: 6px 0 0 0; line-height: 1.1;">${value}</p>
      </div>
    </td>`
}

export function buildReportHtml(data: ReportData): string {
  const title = REPORT_TITLES[data.type]
  const periodLabel = `${formatDate(data.date_from)} &mdash; ${formatDate(data.date_to)}`

  const campaignRows = data.meta.campaigns.map(c => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #1f2937;">${c.campaign_name}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; color: #374151;">${c.impressions.toLocaleString('es-AR')}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; color: #374151;">${c.clicks.toLocaleString('es-AR')}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; color: #374151;">${formatPercent(c.ctr)}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; color: #1d4ed8; font-weight: 600;">${c.leads}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; color: #374151;">${formatCurrency(c.spend)}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; color: ${c.cost_per_lead !== null ? '#15803d' : '#9ca3af'}; font-weight: ${c.cost_per_lead !== null ? '600' : '400'};">${c.cost_per_lead !== null ? formatCurrency(c.cost_per_lead) : '&mdash;'}</td>
    </tr>
  `).join('')

  const pipelineSections = data.pipelines.map(p => {
    const maxNewCount = Math.max(...p.stages.map(s => s.new_contacts), 1)
    const stageRows = p.stages.map(s => {
      const barWidth = Math.max(Math.round((s.new_contacts / maxNewCount) * 100), 2)
      return `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #1f2937; width: 30%;">${s.stage_name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; width: 35%;">
          <div style="background-color: #e5e7eb; border-radius: 4px; height: 22px; width: 100%;">
            <div style="background-color: #7c3aed; border-radius: 4px; height: 22px; width: ${barWidth}%; min-width: 28px; text-align: center; line-height: 22px;">
              <span style="color: #fff; font-size: 11px; font-weight: 600;">${s.new_contacts}</span>
            </div>
          </div>
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: center; color: #6b7280;">${s.contact_count}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; text-align: right; color: #374151;">${formatCurrency(s.opportunity_value)}</td>
      </tr>`
    }).join('')

    return `
      <h3 style="color: #1f2937; font-size: 15px; margin: 24px 0 12px 0; font-weight: 600;">${p.pipeline_name}</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <thead>
          <tr>
            <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Etapa</th>
            <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Nuevos</th>
            <th style="padding: 8px 12px; text-align: center; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Total</th>
            <th style="padding: 8px 12px; text-align: right; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${stageRows}
          <tr style="background-color: #f9fafb;">
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #1f2937;">Total</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #7c3aed;">${p.total_new_contacts} nuevos</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; text-align: center; color: #6b7280;">${p.total_contacts}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; text-align: right; color: #1f2937;">${formatCurrency(p.total_value)}</td>
          </tr>
        </tbody>
      </table>
    `
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 680px; margin: 0 auto; padding: 32px 16px;">

    <!-- Header with Logo -->
    <div style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); border-radius: 16px 16px 0 0; padding: 28px 32px; text-align: center;">
      <img src="https://meek-belekoy-dcf620.netlify.app/pdf-assets/logos/logos-institucionales.png" alt="Diego Ferreyra Inmobiliaria" style="height: 44px; margin-bottom: 12px;" />
      <div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 14px; margin-top: 4px;">
        <p style="color: #d1d5db; font-size: 14px; margin: 0; letter-spacing: 0.3px;">${title}</p>
      </div>
    </div>

    <!-- Body -->
    <div style="background-color: #ffffff; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; padding: 32px;">

      <!-- Period -->
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 24px 0;">Periodo: <strong style="color: #374151;">${periodLabel}</strong></p>

      ${tokenWarningHtml(data.meta_token_expires_at)}

      <!-- KPI Cards -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;" cellpadding="0" cellspacing="0">
        <tr>
          ${kpiCard('Leads', String(data.meta.total_leads), '#eff6ff', '#1d4ed8')}
          ${kpiCard('Costo/Lead', data.meta.average_cost_per_lead !== null ? formatCurrency(data.meta.average_cost_per_lead) : '&mdash;', '#f0fdf4', '#15803d')}
          ${kpiCard('Gasto Total', formatCurrency(data.meta.total_spend), '#fefce8', '#a16207')}
          ${kpiCard('CTR', formatPercent(data.meta.average_ctr), '#faf5ff', '#7c3aed')}
        </tr>
      </table>

      <!-- Divider -->
      <div style="border-top: 2px solid #f3f4f6; margin: 0 0 28px 0;"></div>

      <!-- Meta Ads Table -->
      <h2 style="color: #111827; font-size: 17px; margin: 0 0 16px 0; font-weight: 700;">Meta Ads &mdash; Campa&ntilde;as</h2>
      ${data.meta.campaigns.length > 0 ? `
      <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
        <thead>
          <tr>
            <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Campa&ntilde;a</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Impresiones</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Clicks</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">CTR</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Leads</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Gasto</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">CPL</th>
          </tr>
        </thead>
        <tbody>
          ${campaignRows}
          <tr style="background-color: #f9fafb;">
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #111827;">Total</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; text-align: right; color: #374151;">${data.meta.total_impressions.toLocaleString('es-AR')}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; text-align: right; color: #374151;">${data.meta.total_clicks.toLocaleString('es-AR')}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; text-align: right; color: #374151;">${formatPercent(data.meta.average_ctr)}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; text-align: right; color: #1d4ed8;">${data.meta.total_leads}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; text-align: right; color: #374151;">${formatCurrency(data.meta.total_spend)}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; text-align: right; color: #15803d;">${data.meta.average_cost_per_lead !== null ? formatCurrency(data.meta.average_cost_per_lead) : '&mdash;'}</td>
          </tr>
        </tbody>
      </table>
      </div>
      ` : '<p style="color: #9ca3af; font-size: 14px; background: #f9fafb; padding: 16px; border-radius: 8px; text-align: center;">No hay datos de campa&ntilde;as para este periodo.</p>'}

      <!-- Divider -->
      <div style="border-top: 2px solid #f3f4f6; margin: 0 0 28px 0;"></div>

      <!-- GHL Pipeline -->
      <h2 style="color: #111827; font-size: 17px; margin: 0 0 12px 0; font-weight: 700;">Pipeline CRM</h2>
      ${pipelineSections || '<p style="color: #9ca3af; font-size: 14px; background: #f9fafb; padding: 16px; border-radius: 8px; text-align: center;">No hay datos de pipeline para este periodo.</p>'}

      ${data.call_stats && data.call_stats.total_calls > 0 ? `
      <!-- Divider -->
      <div style="border-top: 2px solid #f3f4f6; margin: 28px 0;"></div>

      <!-- Call Stats -->
      <h2 style="color: #111827; font-size: 17px; margin: 0 0 16px 0; font-weight: 700;">Llamadas</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;" cellpadding="0" cellspacing="0">
        <tr>
          ${kpiCard('Total', String(data.call_stats.total_calls), '#eff6ff', '#1d4ed8')}
          ${kpiCard('Contestadas', String(data.call_stats.answered_calls), '#f0fdf4', '#15803d')}
          ${kpiCard('Perdidas', String(data.call_stats.missed_calls), '#fef2f2', '#dc2626')}
          ${kpiCard('Duraci&oacute;n Prom.', data.call_stats.average_duration_seconds > 0 ? `${Math.floor(data.call_stats.average_duration_seconds / 60)}m ${data.call_stats.average_duration_seconds % 60}s` : '&mdash;', '#faf5ff', '#7c3aed')}
        </tr>
      </table>
      ` : ''}

    </div>

    <!-- Footer -->
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px; padding: 20px 32px; text-align: center;">
      <p style="color: #9ca3af; font-size: 11px; margin: 0;">
        Reporte generado autom&aacute;ticamente &bull; Diego Ferreyra Inmobiliaria
      </p>
    </div>

  </div>
</body>
</html>
  `.trim()
}

export function buildReportSubject(data: ReportData): string {
  const typeLabels: Record<ReportType, string> = {
    daily: 'Diario',
    weekly: 'Semanal',
    monthly: 'Mensual',
  }
  return `${typeLabels[data.type]} Marketing — ${data.meta.total_leads} leads | CPL ${data.meta.average_cost_per_lead !== null ? formatCurrency(data.meta.average_cost_per_lead) : 'N/A'} | ${formatDate(data.date_to)}`
}
